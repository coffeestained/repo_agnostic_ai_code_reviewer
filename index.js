// Code Review Bot Entry Point (Node.js / Express)
// File: index.js
import express from 'express';
import 'dotenv/config';
import { Logger } from './lib/logger.js';
import { actionMap } from './constants/actionMap.js';
import { ignoredUsers } from './constants/ignoredUsers.js';
import { getAdapter } from './adapters/Factory.js';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.get('/health', (_, res) => res.status(200).send('OK'));

app.post('/webhooks', async (req, res) => {
    Logger.debug(`Code Review Agent Webhook Activated. raw: ${JSON.stringify(req.body)}`);
    try {
        const actionMapped = actionMap[req.body.action] ? actionMap[req.body.action](req) : undefined;
        if (ignoredUsers.includes(req.body.sender.login)) Logger.info(`Code Review Agent Webhook will not respond to ignored users.`);
        else if (actionMapped) {
            const adapter = getAdapter(req.body, req.headers);
            if (!adapter) throw new Error("No adapter found.");
            if (!(await adapter.isAuthenticated())) throw new Error("Unable to authenticate with repo.");

            await adapter.getDiff();
            await adapter.getCommentTree();

            Logger.info(`Adapter ${adapter.constructor.name} activated. action: ${actionMapped}`);
            Logger.debug(`Adapter ${adapter.constructor.name} activated`, JSON.stringify(req.body.pull_request, null, 2));

            adapter.getLLMResponse(actionMapped).then(async () => {
                await adapter.postNewReviewer();
                console.log(adapter.llmResponse)
            }).catch((e) => Logger.error(`Issue doing response generation. ${e?.message}`));
        }
        res.status(200).send('Webhook request processed');
    } catch (e) {
        Logger.error(`Adapter experienced an uncaught error during processing. ${e?.message}`);
        res.status(500).send('Webhook request failed');
    }
});

app.listen(PORT, () => {
    Logger.info(`Reviewer Bot listening on port ${PORT}`);
});