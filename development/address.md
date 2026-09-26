# Developer Setup Guide

## Prerequisites
- **Node.js**: v18.x or higher
- **pnpm**: v9.x or higher
- **Docker** & **Docker Compose**
- **Git**

## Getting Started

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/Superray23/ignition-pay.git
   cd ignition-pay
   ```

2. **Install Dependencies:**
   We use `pnpm` workspaces for managing monorepo packages.
   ```bash
   pnpm install
   ```

3. **Configure Environment Variables:**
   Copy the example environment variables to set up your local configuration.
   ```bash
   cp .env.example .env
   # Ensure you configure your required keys such as DATABASE_URL
   ```

4. **Start Local Infrastructure:**
   Start the supporting services (like PostgreSQL, Redis, etc.) using Docker Compose:
   ```bash
   pnpm run dev:infra
   ```

5. **Database Setup:**
   Run Prisma migrations to initialize the database schema:
   ```bash
   cd ignition-api
   pnpm dlx prisma migrate dev
   ```

6. **Start Applications:**
   Start the various services in development mode:
   
   *Frontend:*
   ```bash
   cd ignition-pay-frontend
   pnpm run dev
   ```
   
   *Backend API:*
   ```bash
   cd ignition-api
   pnpm run start:dev
   ```

## Development Workflow

### Git Hooks
Pre-commit hooks are automatically configured during `pnpm install` via the `prepare` script to enforce linting and formatting standards.

### Running Tests
To run tests across all workspaces:
```bash
pnpm run test --recursive
```
# Security Policy

## Supported Versions
We currently support and provide security updates for:
- **v1.0.1** (Latest stable)

## Reporting a Vulnerability
If you discover a security vulnerability, please help us keep the Stellar ecosystem safe:

1. **Private Reporting**: Do NOT open a public issue.
2. **Email**: Send details to **lewechigodsfavour@gmail.com**.
3. **Response**: We will acknowledge your report within 48 hours and coordinate a fix.

Thank you for helping us maintain a secure library.

## Security Audit Checklist
When reviewing or adding new features, please ensure the following checklist is completed:
- [ ] Dependencies are scanned for vulnerabilities via `pnpm audit` (Automated in CI).
- [ ] No hardcoded secrets (API keys, passwords) are present in the codebase.
- [ ] Environment variables are properly documented in `.env.example`.
- [ ] Input validation is applied for all user inputs.
- [ ] Authentication and Authorization checks are verified.
- [ ] Sensitive data is properly encrypted in transit and at rest.
