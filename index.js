// Code Review Bot Entry Point (Node.js / Express)
// File: index.js
import express from 'express';
import { Core } from './providers/Core';
import('dotenv').then(dotenv => dotenv.config());

const coreService = new Core();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.get('/health', (_, res) => res.status(200).send('OK'));

app.post('/webhook/open-review', async (req, res) => {
    const provider = coreService.parseProviderFromRequest(req);
    if (!provider) throw "Bad Request";
    const pullRequestData = provider.fetchPullRequestData();
    res.status(200).send('Open-Review received');
});

app.post('/webhook/comment', async (req, res) => {
    const provider = coreService.parseProviderFromRequest(req);
    if (!provider) throw "Bad Request";
    const pullRequestData = provider.fetchPullRequestData();
    res.status(200).send('Comment received');
});

app.listen(PORT, () => {
    console.log(`Reviewer Bot listening on port ${PORT}`);
});