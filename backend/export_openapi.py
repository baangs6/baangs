import json
from pathlib import Path

from app.main import app


def main():
  schema = app.openapi()
  out = Path(__file__).resolve().parent / "baangs_openapi.json"
  out.write_text(json.dumps(schema, indent=2), encoding="utf-8")
  print(str(out))


if __name__ == "__main__":
  main()

