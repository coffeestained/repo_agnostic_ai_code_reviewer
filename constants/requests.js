
/**
 * Helper function to get the action from the request
 */
export const getAction = (req) => {
    // GitHub action
    if (req.body.action) {
        return req.body.action;
    }
    // GitLab action
    if (req.body.object_attributes?.action) {
        return req.body.object_attributes.action;
    }
    // GitLab note event
    if (req.body.event_type === 'note') {
        return 'note';
    }
    return undefined;
};

/**
 * Helper function to get the sender/user from the request
 */
export const getUser = (req) => {
    // GitHub
    if (req.body.sender?.login) {
        return req.body.sender.login;
    }
    // GitLab
    if (req.body.user?.username) {
        return req.body.user.username;
    }
    return undefined;
};