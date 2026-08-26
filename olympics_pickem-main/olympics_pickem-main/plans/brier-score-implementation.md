# Implementation Plan - Brier Score Scoring System

## 1. 🔍 Analysis & Context
*   **Objective:** Transition the scoring system from a simple point-per-correct-pick model to a "Brier score style" system (modeled after FiveThirtyEight). This rewards accurate predictions and penalizes overconfidence.
*   **Affected Files:**
    *   `config/scoring.json`: Configuration for the new scoring constants.
    *   `config/supabase-schema.sql`: Database schema update (documentation).
    *   `src/services/scoring.js`: Core scoring logic modification.
    *   `src/services/csvProcessor.js`: Parsing the new `confidence` field from CSVs.
    *   `netlify/functions/utils/pickLoader.js`: Server-side parsing of `confidence`.
    *   `src/services/supabase.js`: Updating Supabase client methods to handle `confidence`.
    *   `src/components/picks/PickForm.jsx`: UI to allow users to enter confidence.
    *   `src/pages/RulesPage.jsx`: Explanation of the new scoring rules.
*   **Key Dependencies:** None (uses existing PapaParse and Supabase).
*   **Risks/Unknowns:** 
    *   Migration of existing picks (will default to 0.5 confidence).
    *   User experience: Ensuring the confidence input is intuitive.
    *   Leaderboard impact: Scores will now be decimals/larger integers and can be negative.

## 2. 📋 Checklist
- [ ] Step 1: Update Database Schema & Config
- [ ] Step 2: Implement Brier Scoring Logic
- [ ] Step 3: Update Data Ingestion (CSV & Supabase)
- [ ] Step 4: Update Frontend UI for Confidence Input
- [ ] Step 5: Update Rules & Documentation
- [ ] Verification: Unit Tests & Integration Tests

## 3. 📝 Step-by-Step Implementation Details

### Step 1: Update Database Schema & Config
*   **Goal:** Prepare the system for storing and configuring Brier scores.
*   **Action:**
    *   **Migration:** Run SQL in Supabase: `ALTER TABLE picks ADD COLUMN confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0.5 AND confidence <= 1.0);`.
    *   **Config:** Update `config/scoring.json`:
        ```json
        {
          "mode": "brier",
          "brier": {
            "base": 25,
            "multiplier": 100
          }
        }
        ```
*   **Verification:** Verify the column exists in Supabase and the config loads correctly.

### Step 2: Implement Brier Scoring Logic
*   **Goal:** Update `scoring.js` to calculate points using the Brier formula.
*   **Action:**
    *   Modify `src/services/scoring.js`:
        *   Add `calculateBrierPoints(isCorrect, confidence, multiplier, config)` function.
        *   Formula: `Points = RoundMultiplier * (base - (100 * (Outcome - Confidence)^2))`.
        *   Where `Outcome` is 1 if `isCorrect` is true, 0 otherwise.
        *   Default `confidence` to 0.5 if missing.
    *   Update `calculatePickScore` to use this formula if `config.mode === 'brier'`.
*   **Verification:** Add tests in `src/services/__tests__/scoring.test.js` for various confidence levels (0.5, 0.75, 1.0) and outcomes.

### Step 3: Update Data Ingestion (CSV & Supabase)
*   **Goal:** Allow users to upload picks with confidence levels.
*   **Action:**
    *   Modify `src/services/csvProcessor.js`: Update `parsePickRow` to look for a `confidence` or `probability` column. Normalize values to 0.5 - 1.0 range.
    *   Modify `netlify/functions/utils/pickLoader.js`: Update `parsePickRow` to include the `confidence` field in the returned object.
    *   Modify `src/services/supabase.js`: Update `picks.upsert` to include the `confidence` field.
*   **Verification:** Upload a sample CSV with a `confidence` column and verify it's stored in Supabase.

### Step 4: Update Frontend UI for Confidence Input
*   **Goal:** Enable users to specify their confidence level in the app.
*   **Action:**
    *   Modify `src/components/picks/PickForm.jsx`:
        *   Add a slider or numeric input (0.5 to 1.0) for each game pick.
        *   Explain that 0.5 is "toss-up" and 1.0 is "certain".
    *   Update `src/pages/MyPicksPage.jsx` to display confidence alongside the predicted score.
*   **Verification:** Manually test the form and ensure confidence is saved and displayed.

### Step 5: Update Rules & Documentation
*   **Goal:** Communicate the new scoring system to players.
*   **Action:**
    *   Modify `src/pages/RulesPage.jsx`:
        *   Describe the Brier score formula.
        *   Show a table of example points (e.g., 100% Correct = 25pts, 100% Wrong = -75pts, 50% = 0pts).
*   **Verification:** Check the Rules page in the browser.

## 4. 🧪 Testing Strategy
*   **Unit Tests:**
    *   `scoring.test.js`: Test `calculateBrierPoints` with edge cases (0.5, 0.7, 1.0).
    *   `csvProcessor.test.js`: Test parsing of CSVs with and without confidence columns.
*   **Integration Tests:**
    *   Verify the full flow: Upload CSV -> Store in Supabase -> Fetch in Leaderboard -> Calculate Score.
*   **Manual Verification:**
    *   Check the leaderboard after a game is marked final to ensure scores match the Brier calculation.

## 5. ✅ Success Criteria
*   Picks can be stored with a `confidence` value.
*   Leaderboard displays scores calculated via the Brier formula.
*   Players can see how their confidence levels impacted their scores.
*   The system handles both new picks (with confidence) and old picks (defaulting to 0.5).
