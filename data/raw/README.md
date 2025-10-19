# Raw salary datasets

Place CSV exports from public sources (Glassdoor, Salary Transparente, Levels.fyi, etc.) here. The `fetch_salary_sources` management command will also download files defined in `config/salary_sources.json` into this directory. After populating `data/raw/`, run `build_salary_dataset` to normalize everything into `app/data/tech_salaries_sample.csv`.

Columns are flexible; common aliases such as `job_title`, `experience_level`, `remote_type`, `salary_min`, and `salary_total` are detected automatically. See `sample_salaries.csv` for a minimal reference.
