"""Run the Prayas pathway module: python -m app.pathways examples/pathways/city.json"""

import argparse
import json
from pathlib import Path

from app.pathway_optimizer import optimize
from app.pathways.errors import PathwayError


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--algorithm", choices=("dijkstra", "astar"))
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        parameters = json.loads(args.input.read_text(encoding="utf-8"))
        if not isinstance(parameters, dict):
            raise PathwayError("Input must be a JSON object containing pathway parameters")
        if args.algorithm:
            assignment = parameters.get("assignment", {})
            if not isinstance(assignment, dict):
                raise PathwayError("assignment must be a JSON object")
            parameters["assignment"] = {**assignment, "algorithm": args.algorithm}
        result = json.dumps(optimize(parameters), indent=2, allow_nan=False)
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    if args.output:
        args.output.write_text(result + "\n", encoding="utf-8")
    else:
        print(result)


if __name__ == "__main__":
    main()
