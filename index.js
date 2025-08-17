// Code Review Bot Entry Point (Node.js / Express)
// File: index.js
import express from 'express';
import 'dotenv/config';
import { Logger } from './lib/logger.js';
import { actionMap } from './constants/actionMap.js';
import { getAction, getUser } from './constants/requests.js';
import { ignoredUsers } from './constants/ignoredUsers.js';
import { getAdapter } from './adapters/Factory.js';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.get('/health', (_, res) => res.status(200).send('OK'));

app.post('/webhooks', async (req, res) => {
    Logger.debug(`Code Review Agent Webhook Activated. raw: ${JSON.stringify(req.body)}`);
    try {
        const action = getAction(req);
        const actionMapped = action && actionMap[action] ? actionMap[action](req) : undefined;
        const user = getUser(req);

        if (ignoredUsers.includes(user)) {
            Logger.info(`Code Review Agent Webhook will not respond to ignored users.`);
        } else if (actionMapped) {
            const adapter = getAdapter(req.body, req.headers);
            if (!adapter) throw new Error("No adapter found.");
            if (!(await adapter.isAuthenticated())) throw new Error("Unable to authenticate with repo.");

            await adapter.getDiff();
            await adapter.getCommentTree();

            Logger.info(`Adapter ${adapter.constructor.name} activated. action: ${actionMapped}`);
            Logger.debug(`Adapter ${adapter.constructor.name} activated`, JSON.stringify(req.body.pull_request || req.body.merge_request, null, 2));

            adapter.getLLMResponse(actionMapped).then(async () => {
                Logger.info(`Adapter ${adapter.constructor.name} received ${JSON.stringify(adapter.llmResponse, null, 2)}`);
                await adapter.postNewReviewer();
                Logger.info(`Adapter ${adapter.constructor.name} agent added as a reviewer.`);
                await adapter.doPostProcessingActions();
                Logger.info(`Adapter ${adapter.constructor.name} agent doing post processing with response.`);
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