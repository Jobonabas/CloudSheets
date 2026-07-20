import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { JwtPayload } from "aws-jwt-verify/jwt-model";
import type { CognitoPayload } from "../interfaces/cognitoPayload.ts";

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  tokenUse: 'access',
  clientId: process.env.COGNITO_CLIENT_ID!,
});

export async function verifyJWT(authHeader?: string): Promise<CognitoPayload | null> {
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
        return payload;
    } catch {
        console.log("Token not valid!");
        return null;
    }
}