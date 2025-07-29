# Gemini Reviewer Bot

A bot that auto-reviews pull/merge requests using Gemini AI.

## What It Does

- Listens for webhooks from GitHub, GitLab, or Bitbucket.
- Adds itself as a reviewer if not already.
- Uses Gemini to scan diffs and post review comments.

## Notes

- Tokens for GitHub Require READ access for Repositories and Commits. They require READ & WRITE for pull-requests.

## To Use

1. Add `.env` config with platform and Gemini tokens.
2. Deploy to Cloud Run or similar.
3. Point your repo webhooks to:
   - `POST /webhook/open-review`
   - `POST /webhook/comment`
