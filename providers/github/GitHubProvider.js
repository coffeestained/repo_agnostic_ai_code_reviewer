import { HttpProvider } from '../http/HttpProvider.js';
import { Logger } from '../../lib/logger.js';

export class GitHubProvider {
    action;
    raw;
    repoUrl;

    description;
    comments = [];
    diff;

    constructor(req, action) {
        this.http = new HttpProvider({
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        });

        this.raw = req;
        this.action = action;
        this.repoUrl = req.body.repository.url;

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
        Logger.info(`Action is required. Proceeding to NL generation.`);
    }

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

        const headers = {
            'Accept': 'application/vnd.github.v3+json',
        };

        try {
            // 2. Make parallel API calls to fetch all three content types.
            const [issueComments, reviewComments, reviews] = (await Promise.all([
                this.http.get(issueCommentsUrl, { headers }),
                this.http.get(reviewCommentsUrl, { headers }),
                this.http.get(reviewsUrl, { headers })
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

    /**
     * Validates that an action is needed for this action, comment chain and diff.
     */
    async validateAction() {
        const sortedComments = this.comments.sort((a, b) =>
            new Date(b.creationTime) - new Date(a.creationTime)
        );
        if (this.action === 'initial') {
            const hasAgentDoneInitialReview = sortedComments.some((comment) => comment.username === process.env.GITHUB_AGENT_USER);
            if (!hasAgentDoneInitialReview) {
                return true;
            }
        } else if (this.action === 'comment') {
            const hasCommentChainRequiringResponse = sortedComments.some((comment) => comment.username === process.env.GITHUB_AGENT_USER);
            if (!hasCommentChainRequiringResponse) {
                return true;
            }
        }
        return false;
    }

    async validateAuth() {
        try {
            const res = await this.http.get(this.repoUrl, {
                Accept: "application/vnd.github.v3+json"
            });
            // 200 Access Granted to Repo
            return res.status === 200;
        } catch (err) {
            if (err.response?.status === 403 || err.response?.status === 404) {
                return false;
            }
            return false; // Fallback
        }
    }
}
