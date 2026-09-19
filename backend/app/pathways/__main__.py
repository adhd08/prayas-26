"""Run: python -m app.pathways examples/pathways/city.json"""

import argparse
import json
from pathlib import Path

from app.optimizer import optimize


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--algorithm", choices=("dijkstra", "astar"))
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    parameters = json.loads(args.input.read_text(encoding="utf-8"))
    if args.algorithm:
        parameters.setdefault("assignment", {})["algorithm"] = args.algorithm
    result = json.dumps(optimize(parameters), indent=2, allow_nan=False)
    if args.output:
        args.output.write_text(result + "\n", encoding="utf-8")
    else:
        print(result)


if __name__ == "__main__":
    main()
