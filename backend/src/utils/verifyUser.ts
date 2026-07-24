import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { CognitoPayload } from "../interfaces/cognitoPayload.ts";
import db from '../db.ts'

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  tokenUse: 'access',
  clientId: process.env.COGNITO_CLIENT_ID!,
});
const cognitoDomain = process.env.COGNITO_DOMAIN;

export async function verifyUser(authHeader?: string): Promise<CognitoPayload | null> {
    const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7) //get pure Token String
        : undefined;

    console.log("Extracted Token:", token) //DEV!
    
    if (process.env.NODE_ENV === 'test' && process.env.AUTH_BYPASS === 'true') {
        //Bypass if local Test Env  
        return { sub: 'demo-user-id', email: 'demo@example.com'};
    }

    if(!token) {
        return null; //auth not possible
    }

    try{
        const payload = await verifier.verify(token) as CognitoPayload
        console.log("Token is valid. Payload:", payload); //returns Cognito payload with userid

        const user_exists = await db('users').where({ id: payload.sub }).first();
        if(!user_exists) {
            //first authentication of this user: add user to DB user table with fetched email adress
            let email = payload.email
            if(!email) {
                let response = await fetch(`${cognitoDomain}/oauth2/userInfo`, {
                    method: 'GET',
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    }
                } );
                let additional_userdata = await response.json();
                email = additional_userdata.email
            }
            await db('users').insert({
            id: payload.sub,
            email: email
            });
        } 

        return payload;
    } catch(err) {
        console.error("Token verification failed!: ", err);
        return null;
    }
}