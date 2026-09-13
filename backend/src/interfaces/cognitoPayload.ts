export interface CognitoPayload {
    sub: string; //equals userId
    email?: string;
    username?: string;
};