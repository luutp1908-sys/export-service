# Template SaaS Export Service

This repository is the standalone export service that was extracted from the main backend monolith.

## Purpose

- Owns export job creation, queue processing, and PDF generation.
- Exposes export endpoints independently from the main backend.
- Can be deployed and scaled separately from the monolith.

## Local development

```bash
npm install
cp .env.example .env
npm run start:dev
```

## Build

```bash
npm run build
```

## Health

The app exposes a standard NestJS health route via the app bootstrap, depending on the service implementation.

## Required environment variables

See `.env.example` for the contract.
