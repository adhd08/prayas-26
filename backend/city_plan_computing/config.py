import os
from pathlib import Path

# -------------------------
# Neo4j
# -------------------------

NEO4J_URI = os.environ.get("NEO4J_URI", "neo4j://localhost:7687")
NEO4J_USERNAME = os.environ.get("NEO4J_USERNAME", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "")
# urban_city_dataset/data/processed/graph/import.sh creates this database.
NEO4J_DATABASE = os.environ.get("NEO4J_DATABASE", "urban")
CITY_ID = os.environ.get("URBAN_CITY_ID", "ghsl_1693")


# -------------------------
# Zones
# -------------------------

ZONE_TYPES = [
    "residential",
    "civic",
    "commercial",
    "industrial",
    "green",
    "office",
    "utility",
    "agricultural",
    "unbuilt",
    "other",
]

ZONE_TO_ID = {zone: i for i, zone in enumerate(ZONE_TYPES)}

ID_TO_ZONE = {i: zone for zone, i in ZONE_TO_ID.items()}

NUM_ZONES = len(ZONE_TYPES)


def normalize_zone_type(value: str | None) -> str:
    """Map title-case labels from the urban grid dataset to model classes."""
    normalized = (value or "other").strip().lower()
    return normalized if normalized in ZONE_TO_ID else "other"


# -------------------------
# Model
# -------------------------

HIDDEN_DIM = 128
NUM_GNN_LAYERS = 3
DROPOUT = 0.15

EMBEDDING_DIM = HIDDEN_DIM


# -------------------------
# Training
# -------------------------

LEARNING_RATE = 1e-3
WEIGHT_DECAY = 1e-4

EPOCHS = 100

ROOT_LOSS_WEIGHT = 1.0
EXPAND_LOSS_WEIGHT = 1.0
ZONE_LOSS_WEIGHT = 1.0
STOP_LOSS_WEIGHT = 0.5

DEVICE = "cuda"


# -------------------------
# Data
# -------------------------

DATA_DIR = Path("data")
MODEL_DIR = Path("checkpoints")

NORMALIZATION_FILE = DATA_DIR / "normalization.json"
MODEL_FILE = MODEL_DIR / "city_generator.pt"
