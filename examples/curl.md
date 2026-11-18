# curl

```sh
BASE=https://shaqsiyad.example/api/v1

curl "$BASE/personas?q=nurse&continent=Africa&limit=10"
curl "$BASE/personas/random?count=8&minAge=25&maxAge=40&seed=7"
curl "$BASE/fixtures?shape=employees&count=100&seed=2&format=csv" -o employees.csv
curl "$BASE/households?count=5&seed=3"
curl "$BASE/teams?size=6&industry=Software&seed=4"
curl "$BASE/personas/shq_00042/graph?depth=2"
curl -L "$BASE/personas/shq_00042/avatar?size=128" -o face.webp
curl "$BASE/sheet.png?count=12&seed=5" -o board.png
```
