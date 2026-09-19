from pathlib import Path

import pytest

from app.three_d.engine import TripoSRReconstructor
from app.three_d.errors import InvalidThreeDRequestError, TripoSRUnavailableError
from app.three_d.models import GenerationResult, ThreeDRequest
from app.three_d.service import ThreeDGenerationService


def request(tmp_path: Path, **changes: object) -> ThreeDRequest:
    source = tmp_path / "reference.png"
    source.write_bytes(b"not-decoded-by-validation")
    values: dict[str, object] = {
        "asset_id": "clinic-west-01",
        "source_image": source,
        "output_dir": tmp_path / "output",
    }
    values.update(changes)
    return ThreeDRequest(**values)  # type: ignore[arg-type]


class RecordingProvider:
    def __init__(self) -> None:
        self.requests: list[ThreeDRequest] = []

    def reconstruct(self, generated_request: ThreeDRequest) -> GenerationResult:
        self.requests.append(generated_request)
        generated_request.asset_directory.mkdir(parents=True)
        generated_request.mesh_path.write_text("mesh")
        return GenerationResult(
            asset_id=generated_request.asset_id,
            mesh_path=generated_request.mesh_path,
            output_format=generated_request.output_format,
            device="cpu",
            elapsed_seconds=0.1,
        )


def test_service_validates_and_delegates_to_a_replaceable_provider(tmp_path: Path):
    provider = RecordingProvider()
    generated_request = request(tmp_path, output_format="obj")

    result = ThreeDGenerationService(provider).generate(generated_request)

    assert provider.requests == [generated_request]
    assert result.mesh_path == tmp_path / "output" / "clinic-west-01" / "mesh.obj"
    assert result.mesh_path.is_file()


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"asset_id": "../escape"}, "asset_id"),
        ({"source_image": Path("missing.png")}, "does not exist"),
        ({"mesh_resolution": 8}, "mesh_resolution"),
        ({"foreground_ratio": 1.2}, "foreground_ratio"),
    ],
)
def test_request_rejects_unsafe_or_invalid_values(
    tmp_path: Path, changes: dict[str, object], message: str
):
    with pytest.raises(InvalidThreeDRequestError, match=message):
        request(tmp_path, **changes).validate()


def test_request_rejects_an_unsupported_image_extension(tmp_path: Path):
    source = tmp_path / "reference.svg"
    source.write_text("<svg />")

    with pytest.raises(InvalidThreeDRequestError, match="Input image must"):
        ThreeDRequest("clinic-west-01", source, tmp_path / "output").validate()


def test_triposr_is_not_imported_or_required_until_a_worker_runs(tmp_path: Path):
    generated_request = request(tmp_path)
    provider = TripoSRReconstructor(tmp_path / "missing-triposr")

    with pytest.raises(TripoSRUnavailableError, match="TRIPOSR_REPOSITORY_PATH"):
        provider.reconstruct(generated_request)
