import jwt from 'jsonwebtoken';

const generateInvitationToken =  ({
    role,
    email
}: {
    role: string;
    email: string;
}): string => {
    const INVITATION_EXP = '1h'; // 1 hour
    const token = jwt.sign(
        { role, email },
        (process.env.INVITATION_TOKEN_SECRET as string) || 'default_secret',
        { expiresIn: INVITATION_EXP }
    );
    return token;
}

export default generateInvitationToken;