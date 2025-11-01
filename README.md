# Django on ECS (AWS CDK TypeScript)

Production-style infrastructure (IaC) for a Django app on **Amazon ECS Fargate**, fronted by **ALB**, connected to **RDS PostgreSQL** with **IAM Authentication** (no static passwords), and instrumented with **CloudWatch + SNS**. Designed to be **Free Tier–friendly** while demonstrating production patterns.

## Highlights
- **VPC** with manually selected AZs, /26 public and /22 private subnets.
- **NAT Instance (t3.micro)** optional for dev/lab to avoid NAT Gateway cost.
- **ECS Fargate** service with ALB, health checks, and autoscaling.
- **RDS Postgres** with IAM Auth (no static credentials).
- **DbInit Lambda** creates DB roles and `app_user` via IAM Auth on deploy.
- **Observability**: logs, CPU/memory alarms, and ALB 5xx alarms to SNS.

## Prerequisites
- Node.js 18+ and npm installed locally.
- AWS CLI v2 configured with credentials for the target account/region.
- AWS CDK v2 available (`npm install -g aws-cdk` or rely on `npx cdk`).
- Docker installed if you plan to build/push container images or bundle Lambda code locally.

## Deploy (quick start)
```bash
npm install
cdk bootstrap --region us-east-1
cdk deploy --region us-east-1 -c env=dev NetworkStack-dev DataStack-dev AppStack-dev
```

> The first `AppStack` deploy provisions the Amazon ECR repository (`EcrRepositoryUri`). Push an image tag (defaults to `config.ecs.imageTag`, e.g., `latest`) before expecting the ECS service to pass health checks.

> Because the app now synthesizes three stacks (`NetworkStack`, `DataStack`, and `AppStack`), the CDK CLI needs the explicit stack names (or `--all`) when you deploy.

> Development (`env=dev`) has `buildOnDeploy=true`, so `cdk deploy` rebuilds and publishes the container image automatically—no manual ECR push required.

## Configure environments
All environment-specific settings live in `config/environments.ts`. Duplicate the `dev` block or override the fields below to suit your deployment:
- `service` and `client` control the naming convention for AWS resources.
- `nat.useNatInstance` toggles the development NAT instance in place of NAT Gateways.
- `rds.enableReplica` provisions an optional read replica when set to `true`.
- The primary RDS instance is provisioned with deletion protection and a `RETAIN` removal policy so the database survives stack rollbacks or accidental deletes, and the DbInit Lambda now reads the master credentials from Secrets Manager instead of relying on IAM tokens.
- `ecs.buildOnDeploy` controls whether the Docker image is built during `cdk deploy`. Keep it `true` for `dev` so the asset is rebuilt automatically; set it to `false` for staging/production so they consume an already published tag.
- `ecs.repositoryName` and `ecs.manageRepository` configure the shared ECR repository when `buildOnDeploy=false`. Ensure exactly one environment sets `manageRepository=true` to create the repository.
- `ecs.imageTag` determines the default tag deployed when no `-c imageTag=` override is supplied (the CI pipeline passes the commit hash automatically for non-dev environments; `dev` uses `latest`).
- `observability.alertEmail` sets the destination for CloudWatch alarms.
- `dashboard` controls the static dashboard stack (S3 bucket, CloudFront, Route 53). Set `enabled=true` to provision the bucket/distribution. When `domainName`, `hostedZoneId`, and `hostedZoneName` are provided, the CDK automatically issues a DNS-validated ACM certificate in `us-east-1` (unless you override with `certificateArn`) and creates the alias record. Omit the domain fields to keep the default CloudFront hostname.

Global defaults (naming, tagging, security toggles) are defined in `config/globals.ts`.

Pass `-c env=<name>` (or `-c environment=<name>`) to select which configuration block to deploy.

## Application image
For environments with `buildOnDeploy=true` (default `dev`) the CDK rebuilds and publishes the container image as part of `cdk deploy`, so no additional steps are required. For `buildOnDeploy=false` the ECS service expects an image to exist in the shared repository; use the flow below (or the CI pipeline) to publish the tag before deploying.

Example manual flow:

```bash
# After the first AppStack deploy, capture the repository URI from the stack outputs
REPO_URI=<account-id>.dkr.ecr.us-east-1.amazonaws.com/django-app
IMAGE_TAG=latest   # or whatever tag you plan to deploy

# Build & test locally (optional but recommended)
docker build -t myapp-under-test ./app
docker run --rm -e DJANGO_SETTINGS_MODULE=testapp.settings myapp-under-test python manage.py test

# Push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin "${REPO_URI}"
docker tag myapp-under-test "${REPO_URI}:${IMAGE_TAG}"
docker push "${REPO_URI}:${IMAGE_TAG}"

# Deploy (example for staging)
cdk deploy --region us-east-1 -c env=hml -c imageTag=${IMAGE_TAG} NetworkStack-hml DataStack-hml AppStack-hml

# Subsequent app-only rollouts (non-dev)
cdk deploy --region us-east-1 -c env=hml -c imageTag=${IMAGE_TAG} AppStack-hml

# Development (build-on-deploy)
cdk deploy --region us-east-1 -c env=dev AppStack-dev

> Tip: the stack now honours a `-c region=<aws-region>` context override. Use it if you need to deploy an environment to a region different from the default defined in `config/environments.ts`.
```

## Salary dataset ingestion
The API reads salary data from `app/data/tech_salaries_sample.csv`. Keep the file up to date with two commands:

```bash
# 1. Download raw datasets defined in config/salary_sources.json
python manage.py fetch_salary_sources

# 2. Normalize everything into the canonical CSV consumed by the API
python manage.py build_salary_dataset --country Brazil

# 3. Load the canonical CSV into the database
python manage.py load_salary_dataset
```

How it works:
- `config/salary_sources.json` lists datasets to ingest (URL, destination, optional headers). URLs can be remote (`https://...`) or relative paths (resolved from the JSON file). The command stores the files under `data/raw/` at the repository root (the default paths are computed from `BASE_DIR`).
- Drop additional CSV files directly into `data/raw/` if you acquire data manually. Check `data/raw/sample_salaries.csv` for a minimal reference.
- `build_salary_dataset` normalizes column names (aliases such as `job_title`, `experience_level`, `salary_min`, `remote_type`, `remote_ratio`), standardises text casing, filters by country (defaults to Brazil), and deduplicates rows (`source`, `role`, `level`, `location`, `state`, `work_model`, salary figures).
- `load_salary_dataset` flushes the `SalaryObservation` table, repopulates it from the canonical CSV, and rebuilds cached aggregates per role. API endpoints now serve the cached payload when no extra filters are provided, speeding up repeated queries.
- The Django API now queries the `SalaryObservation` model; rerun `load_salary_dataset` (and restart workers if running in production) whenever the canonical CSV changes.

### Cached aggregates
To regenerate the cached materialised payloads manually, run:

```bash
python manage.py load_salary_dataset --append  # preserves existing data but refreshes caches
python manage.py load_salary_dataset           # full rebuild (drops & reloads data, refreshes caches)
```

Each role receives two JSON blobs in `SalaryRoleAggregate`: one for `/api/salaries/` and one for `/api/salaries/insights/`. Requests with additional filters (state, work model, seniority, etc.) still hit the live tables.

### Scheduled refresh (optional)
`.github/workflows/datasets.yml` runs on a daily cron plus manual `workflow_dispatch`. It downloads the sources, rebuilds the canonical CSV, loads it into SQLite (sanity check), and prints the diff. Configure repository secrets (for example `GH_TOKEN` with `contents: write`) and add a step such as `peter-evans/create-pull-request` if you want the workflow to publish updates automatically.

### Automated dashboard deploy
`.github/workflows/deploy-dashboard.yml` listens for successful runs of the refresh workflow. When the `salary-dashboard` environment is configured with the secrets below, it pushes the exported bundle straight to S3 (or another AWS-backed CDN):

- `DASHBOARD_S3_BUCKET`: target bucket (e.g., `my-salary-dashboard`)
- `DASHBOARD_AWS_ROLE_ARN`: IAM role ARN trusted for GitHub OIDC and permitted to write to the bucket
- `DASHBOARD_AWS_REGION`: AWS region where the bucket lives

If the secrets are not present, the workflow simply downloads the artifact and logs a reminder.

## API quick reference
- `GET /api/salaries/?role=<role>` — summary aggregates (currency, level, state, work model) for a role; accepts optional filters (`state`, `country`, `work_model`, etc.).
- `GET /api/salaries/comparison/?roles=role1,role2` — compare multiple roles with shared filters.
- `GET /api/salaries/insights/?role=<role>` — advanced insights (percentiles, top states/cities/work models and sources) driven by the persisted dataset.

## Static dashboard
`GET /dashboard/` serves a lightweight static experience that calls the APIs above and visualises:
- Total observations, average compensation, and salary ranges for the selected role.
- Percentiles (P25, median, P75) derived from the database.
- Top states, cities, work models, and data sources ranked by average total compensation.

How it works:
1. The page ships as a static template (`app/testapp/templates/dashboard.html`) with inline CSS/JS (Chart.js via CDN) for zero-build deployment.
2. On load, it requests `/api/salaries/` and `/api/salaries/insights/` with the chosen filters (role, state, seniority, work model) and renders dynamic charts.
3. Cached aggregates per role keep the API responses fast; the dashboard always reflects the latest ingested dataset.

Want to host it elsewhere? Run `python manage.py collectstatic` (or copy the template) and publish the generated HTML as a static site—no additional tooling required.

### Pre-rendered bundle
Export the dashboard as a static artifact and ship it to a CDN or S3 bucket:

```bash
python manage.py export_dashboard --output-dir dist/dashboard --filename index.html
```

The scheduled dataset workflow already exports the bundle and uploads it as a GitHub Action artifact. Point your hosting pipeline at `dist/dashboard/index.html` to publish the latest snapshot.

## CI/CD (GitHub Actions)
The repository ships with a CI pipeline defined in `.github/workflows/ci.yml`. It runs on every push and pull request targeting `main`, verifying that the project builds, tests, and packages correctly.

Workflow stages:
1. Configure Node.js 18, run `npm ci`, and execute `npm run build` to validate the TypeScript/CDK code.
2. Set up Python 3.10, upgrade `pip`, and install the dependencies from `app/requirements.txt`.
3. Run `python manage.py test` (SQLite backend) to ensure the Django API behaves as expected.
4. Build the Docker image (`docker build ./app`) as a final smoke check for the container layer.

To extend the pipeline (publish artefacts to ECR, trigger CDK deploys, etc.), add a follow-up job or extra steps that depend on the `build-test` job once it succeeds.

## Cost Awareness Summary
- **RDS t3.micro**: covered by Free Tier (up to 750 hours)
- **NAT Gateway**: **not** Free Tier; use **NAT Instance** for dev/lab
- **CloudWatch**: small usage typically within Free Tier
- **ECS Fargate**: Free Tier has a small monthly allowance; keep task size modest

## IAM Auth in Django
Your Django settings should generate a token at connection time:
```python
import boto3, os
def generate_token():
    rds = boto3.client('rds', region_name=os.getenv('AWS_REGION', 'us-east-1'))
    return rds.generate_db_auth_token(DBHostname=os.environ['DB_HOST'], Port=5432, DBUsername=os.environ['DB_USER'])
# DATABASES['default']['PASSWORD'] = generate_token()
```

## Optional Read Replica
Set `rds.enableReplica` to `true` in `config/environments.ts` (per environment) to deploy a read replica. It is disabled by default to stay within Free Tier.

## Future Improvements
- Integrate **Amazon Route 53** to provision custom DNS records for the ALB so the application is reached through branded hostnames instead of the default AWS address.
- Issue **AWS Certificate Manager** certificates and wire them into the ALB listeners to serve traffic over HTTPS (port 443) end-to-end.
- Replace the single-instance RDS with an **Amazon Aurora** cluster for improved availability, performance, and automatic storage scaling.
- Introduce blue/green deploys via **ECS CodeDeploy** (or Step Functions) so new task sets warm up behind the scenes before shifting traffic, enabling canary/linear rollouts and near-instant rollback.
- Add **Amazon Cognito** user pools (federated with IAM) to centralise identity and control which operators can access the AWS account and application backplane.

## NAT Instance (dev only)
See **DEVELOPER_GUIDE.md** for the cost rationale, security posture (Session Manager enabled), and production guidance when switching back to managed NAT Gateways.
