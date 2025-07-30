// Code Review Bot Entry Point (Node.js / Express)
// File: index.js
import express from 'express';
import { Core } from './providers/Core.js';
import 'dotenv/config';
import { Logger } from './lib/logger.js';
import { actionMap } from './constants/actionMap.js';

const coreService = new Core();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.get('/health', (_, res) => res.status(200).send('OK'));

app.post('/webhooks', async (req, res) => {
    Logger.info(`Code Review Agent Webhook Activated. raw: ${req.body.action}`);
    try {
        const actionMapped = actionMap[req.body.action] ? actionMap[req.body.action](req) : undefined;
        if (actionMapped) {
            const provider = coreService.parseProviderFromRequest(req, actionMapped);
            if (!provider) throw "Bad Request";
            Logger.info(`${provider.constructor.name} provider activated. action: ${actionMapped}`);
            Logger.debug(`${provider.constructor.name} provider activated`, JSON.stringify(req.body.pull_request, null, 2));
        }
        res.status(200).send('Webhook request processed');
    } catch (e) {
        res.status(500).send('Webhook request failed');
    }
});

app.listen(PORT, () => {
    Logger.info(`Reviewer Bot listening on port ${PORT}`);
});