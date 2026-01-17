# USDA Local Food Import (Plain Steps)

## 1) Put the files in the right place
Move the two USDA zip files into:
- `data/food-import/`

Example file names:
- `FoodData_Central_foundation_food_csv_YYYY-MM-DD.zip`
- `FoodData_Central_branded_food_csv_YYYY-MM-DD.zip`

## 2) Make sure the database is ready
Run the normal database update for new tables before you import.

## 3) Run the import
This loads both Foundation and Branded if the files exist:
```
npm run import:usda
```

If you only want one set:
```
npm run import:usda -- --foundation
npm run import:usda -- --branded
```

## Notes
- Branded is very large. It can take a while.
- The import replaces the old local USDA data each time you run it.
