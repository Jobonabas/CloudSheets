import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { CognitoPayload } from "../interfaces/cognitoPayload.ts";
import db from '../db.ts'

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  tokenUse: 'access',
  clientId: process.env.COGNITO_CLIENT_ID!,
});

export async function verifyUser(authHeader?: string): Promise<CognitoPayload | null> {
    const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7) //get pure Token String
        : undefined;

    console.log("Extracted Token:", token) //DEV!
        
    if(!token) {
        return null; //auth not possible
    }

    try{
        const payload = await verifier.verify(token) as CognitoPayload
        console.log("Token is valid. Payload:", payload); //returns Cognito payload with userid

        if(!await db('users').where({ id: payload.sub })) {
            //first authentication of this user: add user to DB user table
            await db('sheets').insert({
            id: payload.sub,
            email: // TODO: insert users into user table 
      })
        } 

        return payload;
    } catch {
        console.log("Token not valid!");
        return null;
    }
}