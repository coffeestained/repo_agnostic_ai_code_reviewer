import { GitHubProvider } from '../github/GitHubProvider.js';
import { GitLabProvider } from '../gitlab/GitLabProvider.js';
import { BitbucketProvider } from '../bitbucket/BitbucketProvider.js';

export class Core {
    providers = {};

    constructor() {
        if (process.env.GITHUB_TOKEN) {
            this.providers.github = new GitHubProvider();
        }
        if (process.env.GITLAB_TOKEN) {
            this.providers.gitlab = new GitLabProvider();
        }
        if (process.env.BITBUCKET_USERNAME && process.env.BITBUCKET_APP_PASSWORD) {
            this.providers.bitbucket = new BitbucketProvider();
        }
    }

    parseProviderFromRequest(req) {
        const ua = req.headers['user-agent'] || '';
        let type;
        if ('x-github-event' in req.headers) type = 'github';
        if ('x-gitlab-event' in req.headers) type = 'gitlab';
        if ('x-event-key' in req.headers || ua.includes('Bitbucket')) type = 'bitbucket';
        return this.providers[type] ? this.providers[type] : false;
    }
}