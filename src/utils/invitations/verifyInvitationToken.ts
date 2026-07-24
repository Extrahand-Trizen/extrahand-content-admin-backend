import jwt from "jsonwebtoken";

export interface TokenDetails {
    success : boolean,
    error? : string,
    data? : InvitationDetails
}

export interface InvitationDetails {
    email : string;
    role : string;
    expiresAt : number;
}

const verifyInvitationToken = (token: string): TokenDetails => {
  try {
    const decodedInvitation = jwt.verify(
      token as string,
      process.env.INVITATION_TOKEN_SECRET || "default_secret",
    );
    const {email, role, exp, iat} = decodedInvitation as {email : string, role : string, exp : number, iat : number};
    return { success: true, data : {email, role, expiresAt : exp} };

  } catch (error : any) {
    if (error?.name === "TokenExpiredError") {
        return {
            success : false,
            error : 'Token has Expired'

        }
    }

    return {success : false, error : 'Invalid Token' }
  }
};


export default verifyInvitationToken;