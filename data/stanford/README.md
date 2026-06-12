# Stanford Official Rankings Data

Place processed JSON files here for official Stanford 2% dataset releases.

## File format

`YYYY.json` — one file per year, e.g. `2024.json`

```json
{
  "year": 2024,
  "total": 207000,
  "entries": [
    {
      "rank": 1,
      "name": "Langer, Robert",
      "institution": "Massachusetts Inst Technol, Cambridge, MA USA",
      "country": "USA",
      "field": "Clinical Medicine",
      "subfield": "Biomedical Engineering",
      "citedByCount": 261000,
      "hIndex": 295,
      "worksCount": 1400,
      "cScore": 8.12,
      "firstYear": 1974,
      "lastYear": 2024,
      "scopusId": "7005898074",
      "openAlexId": "A5100710698"
    }
  ]
}
```

## How to produce these files

1. Download the XLSX from https://elsevier.digitalcommonsdata.com/datasets/btchxktzyw
2. Run: `npx tsx scripts/parse-stanford.ts <file.xlsx> <year>`
3. The script outputs `data/stanford/YYYY.json`

## Taxonomy note

Stanford uses Science-Metrix classification: **22 fields / 174 subfields**.
OpenAlex live/snapshot data uses ASJC classification: **26 fields / 252 subfields**.
When a Stanford JSON is present for a year, the rankings page shows Science-Metrix labels for that year.
