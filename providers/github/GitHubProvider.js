import { HttpProvider } from '../http/HttpProvider.js';
import { doGeminiResponse } from '../gemini/Gemini.js';
import { Logger } from '../../lib/logger.js';

export class GitHubProvider {
    action;
    raw;
    repoUrl;
    pullRequestUrl;

    description;
    comments = [];
    diff;

    constructor(req, action) {
        this.http = new HttpProvider({
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github.v3+json"
        });

        this.raw = req;
        this.action = action;
        this.repoUrl = req.body.repository.url;
        this.pullRequestUrl = req.body.pull_request.url;

        this.processRequest(req);
    }

    async processRequest() {
        if (!(await this.validateAuth())) return;
        Logger.info(`Provider has access to repository`);

        const pullDescription = true;
        const pullComments = ['initial'].includes(this.action);
        const pullDiff = ['initial'].includes(this.action);
        if (pullComments) {
            this.comments = await this.buildCommentTreeFromWebhook(this.raw.body);
            Logger.debug(`Provider processing comments`, JSON.stringify(this.comments, null, 2));
        }
        if (pullDiff) {
            this.diff = (await this.http.get(this.raw.body.pull_request.url, { Accept: "application/vnd.github.v3.diff" })).data;
            Logger.debug(`Provider processing diff`, JSON.stringify(this.diff, null, 2));
        }
        if (pullDescription) {
            this.description = this.raw.body.pull_request.body;
            Logger.info(`Provider processing description`, JSON.stringify(this.description, null, 2));
        }

        if (!(await this.validateAction())) return;

        Logger.info(`Provider action is required. Proceeding to NL generation.`);
        console.log(this.diff);

        const response = await doGeminiResponse(this.diff, this.description, this.action, this.comments);
        Logger.info(`Provider action processed. Proceeding to post-processing.`);
        Logger.info(`Provider action processed. Proceeding to post-processing. ${response}`);

        await this.addBotAsReviewer(process.env.GITHUB_AGENT_USER);
        await this.doPostProcessingActions(response);
    }

    /////////////////////////////////////
    // TRANSFOMATION SECTION ------------

    /**
     * Processes a GitHub pull_request webhook, fetches all associated comments
     * (including review summaries), and builds a hierarchical comment tree.
     * @param {object} webhookBody - The full req.body from the GitHub pull_request webhook.
     * @returns {Promise<Array<object>>} A promise that resolves to the comment tree.
     */
    async buildCommentTreeFromWebhook(webhookBody) {
        const pr = webhookBody.pull_request;
        const repo = webhookBody.repository;
        const prNumber = webhookBody.number;

        // 1. Extract necessary info from the payload
        const pullRequestId = pr.id;
        const issueCommentsUrl = pr.comments_url;
        const reviewCommentsUrl = pr.review_comments_url;
        const reviewsUrl = `https://api.github.com/repos/${repo.full_name}/pulls/${prNumber}/reviews`;

        try {
            // 2. Make parallel API calls to fetch all three content types.
            const [issueComments, reviewComments, reviews] = (await Promise.all([
                this.http.get(issueCommentsUrl, {}),
                this.http.get(reviewCommentsUrl, {}),
                this.http.get(reviewsUrl, {})
            ])).map((response) => response.data);

            // 3. Transform review summary objects into our standard comment format.
            const reviewBodyComments = reviews
                .filter(review => review.body);

            // 4. Combine and transform all comments into a unified format
            const allComments = [
                ...reviewBodyComments.map(c => this.transformReviewToComment(c, pullRequestId)),
                ...issueComments.map(c => this.transformComment(c, pullRequestId)),
                ...reviewComments.map(c => this.transformComment(c, pullRequestId))
            ];

            // 5. Build and return the final hierarchical tree
            const tree = this.buildCommentTree(allComments);
            return tree;

        } catch (error) {
            throw error; // Re-throw to be handled by the caller
        }
    }

    /**
     * Transforms a GitHub API review summary object into our desired comment format.
     * These are the top-level review comments (e.g., "Review Parent").
     */
    transformReviewToComment = (review, pullRequestId) => ({
        id: review.id,
        pullRequestId,
        body: review.body,
        userName: review.user.login,
        commentDateTime: review.submitted_at,
        parentId: null,
        isResolved: false,
        children: [],
    });

    /**
     * Transforms a GitHub API issue or line-specific review comment object.
     */
    transformComment = (comment, pullRequestId) => ({
        id: comment.id,
        pullRequestId,
        body: comment.body,
        userName: comment.user.login,
        commentDateTime: comment.created_at,
        parentId: comment.in_reply_to_id || comment.pull_request_review_id || null,
        isResolved: comment.state === 'resolved',
        children: [],
    });

    /**
     * Builds the final hierarchical comment tree from a flat list of comments.
     */
    buildCommentTree = (comments) => {
        const commentMap = {};
        const tree = [];

        // Sort comments by creation time to ensure parents are processed before children.
        comments.sort((a, b) => new Date(a.commentDateTime) - new Date(b.commentDateTime));

        // First Pass: All Should Exist In Map
        comments.forEach(comment => {
            commentMap[comment.id] = comment;
        });

        // Map Comments To Correct Location In Tree
        comments.forEach(comment => {
            if (comment.parentId && commentMap[comment.parentId]) {
                commentMap[comment.parentId].children.push(comment);
                delete commentMap[comment.id];
            }
        });

        // Convert to Array
        Object.values(commentMap).forEach((value) => tree.push(value));

        return tree;
    }

    /////////////////////////////////////
    // VALIDATION SECTION ---------------

    /**
     * Validates that an action is needed for this action, comment chain and diff.
     */
    async validateAction() {
        if (this.action === 'initial') {
            const hasAgentDoneInitialReview = this.comments.some((comment) => comment.userName === process.env.GITHUB_AGENT_USER);
            if (!hasAgentDoneInitialReview) {
                Logger.info('Provider should do the initial review');
                return true;
            }
        } else if (this.action === 'comment') {
            const hasCommentChainRequiringResponse = this.comments.some((comment) => comment.userName === process.env.GITHUB_AGENT_USER);
            if (!hasCommentChainRequiringResponse) {
                Logger.info('Provider should respond to latest comment or resolve and approve');
                return true;
            }
        }
        Logger.info('Provider has no action required');
        return false;
    }

    /**
     * Validates that an action can be authorized for this request.
     */
    async validateAuth() {
        try {
            const res = await this.http.get(this.repoUrl, {});
            // 200 Access Granted to Repo
            return res.status === 200;
        } catch (err) {
            if (err.response?.status === 403 || err.response?.status === 404) {
                return false;
            }
            return false; // Fallback
        }
    }

    /////////////////////////////////////
    // POST PROCESSING SECTION ----------

    async leaveReviewComment(payload) {
        const url = `${this.pullRequestUrl}/comments`;
        Logger.info(`Provider posting PENDING review comment to ${payload.path}`);
        await this.http.post(url, payload);
    }

    async leaveIssueComment(body) {
        const url = `${this.raw.body.pull_request.issue_url}/comments`;
        const payload = { body };
        Logger.info(`Provider posting general issue comment.`);
        await this.http.post(url, payload);
    }

    async submitReview(event, message) {
        const url = `${this.pullRequestUrl}/reviews`;
        const payload = {
            commit_id: this.raw.body.pull_request.head.sha,
            body: message,
            event: event,
        };

        Logger.info(`Provider submitting final review with status: ${event}`);
        try {
            await this.http.post(url, payload);
        } catch (e) {
            console.log(e);
        }
    }

    async doPostProcessingActions(response) {
        Logger.info(`Provider starting post-processing for AI response.`);

        if (Array.isArray(response.comments)) {
            for (const comment of response.comments) {
                if (comment.filePath && comment.line) {
                    try {
                        await this.leaveReviewComment({
                            path: comment.filePath,
                            line: comment.line,
                            body: comment.message,
                            commit_id: this.raw.body.pull_request.head.sha,
                            side: comment.side
                        });
                    } catch (e) { console.log(e) }
                    console.log({
                        path: comment.filePath,
                        line: comment.line,
                        body: comment.message,
                        commit_id: this.raw.body.pull_request.head.sha,
                        side: comment.side
                    })

                } else {
                    await this.leaveIssueComment(comment.message);
                }
            }
        }

        const reviewEvent = response.approved ? 'APPROVE' : 'COMMENT';
        await this.submitReview(reviewEvent, response.baseMessage);

        Logger.info('Provider post-processing complete. Review has been submitted.');
    }

    async addBotAsReviewer(botUsername) {
        const owner = this.raw.body.repository.owner.login;
        const repo = this.raw.body.repository.name;
        const pullNumber = this.raw.body.pull_request.number;

        const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviewers`;
        const payload = {
            reviewers: [botUsername],
        };

        try {
            Logger.info(`Provider adding '${botUsername}' as a reviewer...`);
            await this.http.post(url, payload);
            Logger.info(`Provider successfully added '${botUsername}' as a reviewer.`);
        } catch (error) {
            Logger.error(`Provider could not add bot as reviewer: ${error.message}`);
        }
    }
}
