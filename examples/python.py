import json
import urllib.request

BASE = "https://shaqsiyad.example/api/v1"

with urllib.request.urlopen(f"{BASE}/fixtures?shape=patients&count=5&seed=9") as res:
    patients = json.load(res)

for p in patients:
    print(p["mrn"], p["fullName"], p["bloodType"], p["phone"])
