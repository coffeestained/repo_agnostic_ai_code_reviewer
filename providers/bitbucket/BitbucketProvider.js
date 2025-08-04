import { HttpProvider } from '../http/HttpProvider.js';

export class BitbucketProvider {
    constructor(req, action) {
        this.http = new HttpProvider({
            Authorization: `Bearer ${process.env.BITBUCKET_TOKEN}`,
        });

        this.action = action;
        this._processRequest(req);
    }

    _processRequest(req) {
        // TODO: Implement access validation if needed
    }
}