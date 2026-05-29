# EC2 Deployment

This project now deploys `apps/web` to EC2 with PM2 + Nginx. If the frontend stays on Vercel, set `API_ORIGIN` in Vercel so `/api/*` rewrites to EC2.

## Local SSH Key

`harry-server.pem` must stay local and must not be committed. `.gitignore` now ignores `*.pem`.

Fix local key permissions:

```bash
chmod 400 harry-server.pem
```

Connect manually:

```bash
ssh -i harry-server.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

## One-Time EC2 Bootstrap

Copy repo to EC2 or clone it during bootstrap. From your laptop, SSH into EC2, then run:

```bash
sudo env DOMAIN=your-domain.com \
  REPO_URL=https://github.com/trunghieupython10102001/TradeVault.git \
  BRANCH=main \
  bash /var/www/tradevault/scripts/ec2-bootstrap.sh
```

If repo does not exist on EC2 yet, clone first:

```bash
sudo mkdir -p /var/www
sudo chown ubuntu:ubuntu /var/www
git clone https://github.com/trunghieupython10102001/TradeVault.git /var/www/tradevault
cd /var/www/tradevault
sudo env DOMAIN=your-domain.com REPO_URL=https://github.com/trunghieupython10102001/TradeVault.git BRANCH=main bash scripts/ec2-bootstrap.sh
```

## Production Env

Create `/var/www/tradevault/apps/web/.env` on EC2:

```env
DATABASE_URL="postgresql://tradevault_user:strong-password@localhost:5432/tradevault"
AUTH_SECRET="replace-with-openssl-rand-base64-32"
NEXTAUTH_URL="https://your-domain.com"
NODE_ENV="production"
```

Generate secret:

```bash
openssl rand -base64 32
```

## Database

Local Postgres on same EC2:

```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE tradevault;
CREATE USER tradevault_user WITH ENCRYPTED PASSWORD 'strong-password';
GRANT ALL PRIVILEGES ON DATABASE tradevault TO tradevault_user;
ALTER DATABASE tradevault OWNER TO tradevault_user;
\q
```

## First Deploy

```bash
cd /var/www/tradevault
BRANCH=main APP_NAME=tradevault bash scripts/ec2-deploy.sh
```

Check app:

```bash
pm2 status
pm2 logs tradevault
curl -I http://127.0.0.1:3000
```

## Domain With Vercel DNS

In Vercel DNS, update records:

```text
A     @      YOUR_EC2_PUBLIC_IP
CNAME www    your-domain.com
```

If using subdomain:

```text
A     api    YOUR_EC2_PUBLIC_IP
```

Wait for DNS propagation, then enable SSL:

```bash
sudo env ENABLE_SSL=true DOMAIN=your-domain.com LETSENCRYPT_EMAIL=you@example.com REPO_URL=https://github.com/trunghieupython10102001/TradeVault.git bash /var/www/tradevault/scripts/ec2-bootstrap.sh
```

## GitHub Secrets

Add these in GitHub repo settings: `Settings > Secrets and variables > Actions`.

```text
EC2_HOST=YOUR_EC2_PUBLIC_IP_OR_DOMAIN
EC2_USER=ubuntu
EC2_PORT=22
EC2_APP_DIR=/var/www/tradevault
EC2_SSH_KEY=<contents of harry-server.pem>
```

## Vercel Frontend With EC2 Backend

Keep `tradevaultjournal.vercel.app` on Vercel and proxy API traffic to EC2.

Set Vercel project env var:

```text
API_ORIGIN=http://ec2-13-212-83-12.ap-southeast-1.compute.amazonaws.com
```

Then redeploy Vercel. Browser calls to `https://tradevaultjournal.vercel.app/api/*` will be rewritten by Next.js to EC2.

Do not use `NEXT_PUBLIC_API_URL` for this flow; client code uses relative `/api/*` paths.

Paste full key including:

```text
-----BEGIN ... PRIVATE KEY-----
...
-----END ... PRIVATE KEY-----
```

## CI/CD Flow

On every push to `main`, GitHub Actions will:

1. Install dependencies with `npm ci`.
2. Generate Prisma client.
3. Run migrations against CI Postgres.
4. Build database package.
5. Run lint, tests, and build.
6. SSH to EC2 and run `scripts/ec2-deploy.sh`.

## Monitoring

Install basic self-healing monitoring on EC2:

```bash
cd /var/www/tradevault
sudo HEALTHCHECK_URL=https://your-domain.com MONITORING_WEBHOOK_URL="" bash scripts/install-monitoring.sh
```

Optional Slack/Discord webhook:

```bash
sudo HEALTHCHECK_URL=https://your-domain.com MONITORING_WEBHOOK_URL="https://hooks.slack.com/services/..." bash scripts/install-monitoring.sh
```

Useful commands:

```bash
systemctl status tradevault-healthcheck.timer
journalctl -u tradevault-healthcheck.service -n 100 --no-pager
pm2 monit
pm2 logs tradevault
sudo tail -n 100 /var/log/nginx/error.log
```

## Backups

Create manual DB backup:

```bash
pg_dump "$DATABASE_URL" > tradevault-$(date +%F).sql
```

Recommended next step: add automated nightly `pg_dump` to S3 once AWS bucket name is known.

## Render Cutover

After EC2 works and DNS points to EC2:

1. Stop Render web service.
2. Keep Render database only if `DATABASE_URL` still points there.
3. Remove old `NEXT_PUBLIC_API_URL=https://trading-journal-api.onrender.com` from Vercel/env if no longer used.
