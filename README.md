# Explain the Model

**App:** https://edjavi120.github.io/explain-the-model/

| Section | Direct link | My viewer should walk away knowing… |
|---|---|---|
| Push & Pull (linear regression) | https://edjavi120.github.io/explain-the-model/#linear | A linear prediction is the starting point (the prediction for the training average) plus one signed push per feature, and each push is the coefficient times how far this person is from the average, so the same coefficient can give a big push or almost none. |
| Wisdom of the Forest (random forest) | https://edjavi120.github.io/explain-the-model/#forest | A random forest's prediction is the average of 100 trees that differ because each learned from a different bootstrap sample with random features at each split, and the spread of their guesses is disagreement between trees, not a confidence interval. |
| One Correction at a Time (gradient boosting) | https://edjavi120.github.io/explain-the-model/#boosting | Boosting starts at the training average and adds one small, learning-rate-scaled correction per round fitted to the leftover training errors, and you stop at the round with the lowest validation error, not when training error stops falling. |

An app that explains three regression models to an anonymous visitor who knows about machine learning and regression, but not how these algorithms work. Datasets: NHANES fasting glucose, blood pressure and lung function.

Submit the link to **this repository** on Canvas. Reviewers open the app link above.

## What's here
| File | What it is |
|---|---|
| `index.html`, `app.js`, `m10.js` | The app (GitHub Pages route) |
| `outputs/` | Reference model outputs that every number comes from (field guide: `outputs/SCHEMA.md`) |
| `data/` | The three datasets and the data dictionary |
| `check.md` | Numbers the finished app must still show (all verified) |
| `AGENT_BRIEF.md`, `SETUP.md` | Starter instructions |
| `prompts.md` | Log of the prompts given to the AI agent |
| `streamlit_app.py`, `m10.py`, `requirements.txt` | Unused Streamlit route from the starter |

## Run locally
`python -m http.server 8000`, then open <http://localhost:8000>
