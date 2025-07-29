import { HttpProvider } from '../http/HttpProvider.js';

export class GitHubProvider {
    constructor() {
        this.http = new HttpProvider({
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        });
    }

    /**
     * Validates that we have access to this repo
     * @param {object} req - Incoming webhook request
     */
    validateAccess(req) {
        // TODO: Implement access validation if needed
    }

    /**
     * Extracts pull request data from the GitHub webhook request
     * @param {object} req - Incoming webhook request
     * @returns {Promise<object>} - PR data including diff text
     */
    async fetchPullRequestData(req) {
        const diffUrl = req.body?.pull_request?.diff_url;
        if (!diffUrl) throw new Error('Missing diff_url in payload');

        const response = await this.http.get(diffUrl, {
            Accept: 'application/vnd.github.v3.diff'
        });
        return { diff: response.data };
    }

    /**
     * Returns the assignee username from the webhook request
     * @param {object} req
     */
    getAssignee(req) {
        return req.body?.pull_request?.assignee?.login || null;
    }

    /**
     * Returns the repository URL from the webhook request
     * @param {object} req
     */
    getRepoUrl(req) {
        return req.body?.repository?.html_url || null;
    }

    /**
     * Parses and returns the comment list in tree format
     * @param {object} req
     */
    getCommentTree(req) {
        // TODO: Parse comment tree from GitHub webhook payload
        return [];
    }
}
