import parse from 'parse-diff';

import { HttpProvider } from '../http/HttpProvider.js';
import { doGeminiResponse } from '../gemini/Gemini.js';
import { Logger } from '../../lib/logger.js';
import e from 'express';

export class GitHubProvider {
    _AGENT_USER = process.env.GITHUB_AGENT_USER;

    action;
    raw;
    repoUrl;
    pullRequestUrl;
    latestCommitHash;

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
        this.pullRequestId = req.body.pull_request.id;
        this.latestCommitHash = req.body.after;
    }

    async processRequest() {
        if (!(await this.validateAuth())) return;
        Logger.info(`Provider has access to repository`);

        const pullDescription = true;
        const pullComments = ['initial', 'update'].includes(this.action);
        const pullDiff = ['initial', 'update'].includes(this.action);
        if (pullComments) {
            this.comments = await this.buildCommentTreeFromWebhook(this.raw.body);
            Logger.debug(`Provider processing comments`, JSON.stringify(this.comments, null, 2));
        }
        if (pullDiff) {
            this.diff = parse((await this.http.get(this.raw.body.pull_request.url, { Accept: "application/vnd.github.v3.diff" })).data).map(file => {
                const changes = [];
                for (const chunk of file.chunks) {
                    let oldLine = chunk.oldStart;
                    let newLine = chunk.newStart;

                    for (const change of chunk.changes) {
                        let side, line;

                        if (change.type === 'normal') {
                            oldLine++;
                            newLine++;
                            continue; // skip unchanged lines
                        }

                        if (change.type === 'add') {
                            side = 'RIGHT';
                            line = newLine++;
                        } else if (change.type === 'del') {
                            side = 'LEFT';
                            line = oldLine++;
                        }

                        changes.push({
                            side,
                            line,
                            type: change.type,
                            content: change.content,
                        });
                    }
                }

                return {
                    filePath: file.to.replace(/^b\//, ''),
                    changes,
                };
            });
            Logger.debug(`Provider processing diff`, JSON.stringify(this.diff, null, 2));
        }
        if (pullDescription) {
            this.description = this.raw.body.pull_request.body;
            Logger.debug(`Provider processing description`, JSON.stringify(this.description, null, 2));
        }

        if (!(await this.validateAction())) return;

        Logger.info(`Provider action is required for ${this.pullRequestId}. Proceeding to NL generation.`);

        const response = await doGeminiResponse(this.diff, this.description, this.action, this.comments, process.env.GITHUB_AGENT_USER);
        Logger.info(`Provider action processed. Proceeding to post-processing.`);
        Logger.debug(`Provider action processed. Proceeding to post-processing. ${JSON.stringify(response, null, 2)}`);

        if (this.action === 'initial') await this.addBotAsReviewer(this._AGENT_USER);

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

        // 1. Extract necessary info from the payload
        const [_, owner, repo, pulls, pullRequestId] = pr.url.split('/');
        const issueCommentsUrl = pr.comments_url;
        const reviewCommentsUrl = pr.review_comments_url;
        const reviewsUrl = `${pr.url}/reviews`;

        try {
            // 2. Make parallel API calls to fetch all three content types.
            const [resolutionMap, issueComments, reviewComments, reviews] = (await Promise.all([
                this.fetchThreadResolutions(owner, repo, parseInt(pullRequestId)),
                this.http.get(issueCommentsUrl, {}),
                this.http.get(reviewCommentsUrl, {}),
                this.http.get(reviewsUrl, {})
            ])).map((response) => response.data);

            console.log(resolutionMap)

            // 3. Transform review summary objects into our standard comment format.
            const reviewBodyComments = reviews
                .filter(review => review.body);

            // 4. Combine and transform all comments into a unified format
            const allComments = [
                ...reviewBodyComments.map(c => this.transformReviewToComment(c)),
                ...issueComments.map(c => this.transformComment(c)),
                ...reviewComments.map(c => this.transformComment(c, resolutionMap))
            ];

            // 5. Build and return the final hierarchical tree
            const tree = this.buildCommentTree(allComments);
            return tree;

        } catch (error) {
            throw error; // Re-throw to be handled by the caller
        }
    }

    async fetchThreadResolutions(owner, repo, pullNumber) {
        const query = `
        query GetReviewThreads($owner: String!, $repo: String!, $pullNumber: Int!) {
            repository(owner: $owner, name: $repo) {
            pullRequest(number: $pullNumber) {
                reviewThreads(first: 100) {
                nodes {
                    isResolved
                    comments(first: 100) {
                    nodes {
                        id
                    }
                    }
                }
                }
            }
            }
        }
        `;

        const variables = { owner, repo, pullNumber };

        const response = await this.httpGraphQL.post('/graphql', { query, variables });
        const threads = response.data.data.repository.pullRequest.reviewThreads.nodes;

        const resolutionMap = {};
        threads.forEach(thread => {
            thread.comments.nodes.forEach(comment => {
                resolutionMap[comment.id] = thread.isResolved;
            });
        });

        return { data: resolutionMap };
    }

    /**
     * Transforms a GitHub API review summary object into our desired comment format.
     * These are the top-level review comments (e.g., "Review Parent").
     */
    transformReviewToComment = (review) => ({
        id: review.id,
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
    transformComment = (comment, resolutionMap = {}) => ({
        id: comment.id,
        body: comment.body,
        userName: comment.user.login,
        commentDateTime: comment.created_at,
        parentId: comment.in_reply_to_id || comment.pull_request_review_id || null,
        isResolved: resolutionMap[comment.id] ?? false,
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
            return true;
        } else if (this.action === 'update') {
            return true;
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
    async responseToUpdateRequest(response) {
        if (Array.isArray(response.comments)) {
            for (const comment of response.comments) {
                const { commentId, message, resolveReviewThread } = comment;

                const owner = this.raw.body.repository.owner.login;
                const repo = this.raw.body.repository.name;
                const pullNumber = this.raw.body.pull_request.number;

                const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/comments/${commentId}/replies`;
                Logger.info(`Provider replying to review comment ${url}`);
                await this.http.post(url, { body: message });

                if (resolveReviewThread) {
                    Logger.info(`Provider requested to resolve thread for comment ${commentId}`);
                    this.resolveThreadFromParentComment({ owner, repo, pullNumber, parentCommentId: commentId })
                }
            }
        }
    }

    /**
     * @description Resolving threads is not accesssible via GitHub API. However there is a graphql solution we can do.
     * @param {*} args 
     * @returns 
     */
    async resolveThreadFromParentComment({ owner, repo, pullNumber, parentCommentId }) {
        const queryUrl = 'https://api.github.com/graphql';
        const queryThreads = `
        query GetThreads($owner: String!, $repo: String!, $pr: Int!) {
            repository(owner: $owner, name: $repo) {
            pullRequest(number: $pr) {
                reviewThreads(first: 100) {
                nodes {
                    id
                    comments(first: 100) {
                    nodes {
                        databaseId
                    }
                    }
                }
                }
            }
            }
        }
        `;

        const threadData = await this.http.post(queryUrl, {
            query: queryThreads,
            variables: { owner, repo, pr: pullNumber }
        }, {
            headers: {
                'Authorization': `Bearer ${this.githubToken}`,
                'Content-Type': 'application/json'
            }
        }).then(res => res.data);

        const threads = threadData?.data?.repository?.pullRequest?.reviewThreads?.nodes;

        if (!threads) {
            throw new Error('Could not fetch review threads.');
        }

        const targetThread = threads.find(t =>
            t.comments.nodes.some(c => c.databaseId === parentCommentId)
        );

        if (!targetThread) {
            throw new Error(`Thread not found for comment ID ${parentCommentId}`);
        }

        const threadId = targetThread.id;
        const resolveMutation = `
        mutation ResolveThread($threadId: ID!) {
            resolveReviewThread(input: {threadId: $threadId}) {
            thread {
                isResolved
            }
            }
        }
        `;

        const result = await this.http.post(queryUrl, {
            query: resolveMutation,
            variables: { threadId }
        }, {
            headers: {
                'Authorization': `Bearer ${this.githubToken}`,
                'Content-Type': 'application/json'
            }
        }).then(res => res.data);

        if (result.errors) {
            Logger.error('Provider failed to resolve thread:', result.errors);
            throw new Error('GraphQL error when resolving thread.');
        }

        Logger.info(`Provider is resolving thread ${threadId}.`);
        return result.data.resolveReviewThread.thread;
    }



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
            Logger.error(`Provider failed to submit review ${e}.`);
            throw e;
        }
    }

    async doPostProcessingActions(response) {
        Logger.info(`Provider starting post-processing for AI response.`);

        if (this.action === 'initial') {
            if (Array.isArray(response.comments)) {
                for (const comment of response.comments) {
                    if (comment.filePath && comment.line) {
                        try {
                            await this.leaveReviewComment({
                                path: comment.filePath,
                                line: comment.line,
                                body: `${comment.message} You can discuss the request or make a change to trigger a re-review. When all threads are resolved -- the agent will approve.`,
                                commit_id: this.raw.body.pull_request.head.sha,
                                side: comment.side
                            });
                        } catch (e) {
                            Logger.error('Provider failed to submit review comment.');
                            Logger.debug(`Provider failed to submit review comment details ${e}.`)
                            throw e;
                        }
                    } else {
                        await this.leaveIssueComment(comment.message);
                    }
                }
            }
        } else if (this.action === 'update') {
            await this.responseToUpdateRequest(response);
        }

        const reviewEvent = response.approved ? 'APPROVE' : 'COMMENT';
        if (response.baseMessage) {
            await this.submitReview(reviewEvent, response.baseMessage);
        }

        Logger.info(`Provider post-processing complete. ${response.baseMessage ? 'Review has been submitted.' : ''}`);
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
            throw error;
        }
    }
}
