import axios from 'axios';

export class HttpProvider {
    constructor(authHeaders = {}) {
        this.authHeaders = {
            ...authHeaders,
            'User-Agent': 'Ai-Reviewer-Bot'
        };
    }

    async get(url, headers = {}) {
        return axios.get(url, { headers: { ...this.authHeaders, ...headers } });
    }

    async post(url, data = {}, headers = {}) {
        return axios.post(url, data, { headers: { ...this.authHeaders, ...headers } });
    }

    async patch(url, data = {}, headers = {}) {
        return axios.patch(url, data, { headers: { ...this.authHeaders, ...headers } });
    }

    async put(url, data = {}, headers = {}) {
        return axios.put(url, data, { headers: { ...this.authHeaders, ...headers } });
    }
}