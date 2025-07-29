import { HttpProvider } from '../http/HttpProvider.js';

export class GitLabProvider {
    constructor() {
        this.http = new HttpProvider({
            Authorization: `Bearer ${process.env.GITLAB_TOKEN}`,
        });
    }

    validateAccess(req) {
        // TODO: Implement access validation if needed
    }

    async fetchPullRequestData(req) {
        const diffUrl = req.body?.object_attributes?.diff_url || req.body?.object_attributes?.url + '/diffs';
        if (!diffUrl) throw new Error('Missing diff_url in payload');

        const response = await this.http.get(diffUrl, {
            Accept: 'application/json'
        });
        return { diff: response.data };
    }

    getAssignee(req) {
        return req.body?.assignee?.username || null;
    }

    getRepoUrl(req) {
        return req.body?.repository?.homepage || null;
    }

    getCommentTree(req) {
        // TODO: Parse comment tree from GitLab webhook payload
        return [];
    }
}