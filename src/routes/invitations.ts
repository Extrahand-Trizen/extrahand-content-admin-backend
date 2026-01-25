import express from "express";
import allowRoles from "../middleware/roles";
import authenticate from "../middleware/auth";
import { z } from "zod";
import { Request, Response, NextFunction } from "express";
import createHttpError from "http-errors";
import { fromError } from "zod-validation-error";
import { StatusCodes as HttpCode } from "http-status-codes";
import axios from "axios";
import generateInvitationToken from "../utils/invitations/generateInvitationToken";
import jwt from "jsonwebtoken";
import verifyInvitationToken from "../utils/invitations/verifyInvitationToken";
import { sendEmailVerification } from "../utils/email";
import User from "../models/User";

import bcrypt from "bcrypt";
import crypto from "crypto";

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12);

const invitationRouter = express.Router();

const invitationSchema = z.object({
  email: z
    .string()
    .refine((email) => email.includes("@"), {
      message: "Invalid email address",
    })
    .refine((email) => email.endsWith("gmail.com"), {
      message: "Email must end with gmail.com",
    }),
  role: z.enum(["reviewer", "writer"]),
});

const emailServiceApi = axios.create({
  baseURL: process.env.EMAIL_SERVICE || "https://api.emailservice.com/v1",
  headers: {
    Authorization: `Bearer ${process.env.EMAIL_SERVICE_API_KEY}`,
    "Content-Type": "application/json",
  },
});

// SignUp with Invitation Token
invitationRouter.post(
  "/signup",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<Response | void> => {
    const { name, password, inviteToken : invitationToken } = req.body;

    try {
      const tokenDetails = verifyInvitationToken(invitationToken as string);

      if (!tokenDetails.success) {
        return next(
          createHttpError(
            HttpCode.BAD_REQUEST,
            tokenDetails.error || "Invalid Token",
          ),
        );
      }

      const userRole = tokenDetails.data?.role || "user";
      const email = tokenDetails.data?.email || "";


      console.log('User Role from Token:', userRole);
      console.log('Email from Token:', email);

      try {
        // Check if user already exists
        const existingUser = await User.findOne({ $or: [{ email }] });
        if (existingUser) {
          return res
            .status(409)
            .json({ error: "User with given email already exists" });
        }

        // Check if email already exists
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
          return res.status(409).json({ error: "Email already registered" });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const user = await User.create({
          name,
          email,
          passwordHash,
          role: userRole,
          status: "APPROVED",
          emailVerified: false, // Email verification required
        });

        // Generate email verification token
        // @ts-ignore
        const verificationToken = user?.createEmailVerificationToken(); 
        await user.save();

        // Send verification email
        const verificationURL = `${process.env.CLIENT_URL || "http://localhost:3000"}/verify-email/${verificationToken}`;
        await sendEmailVerification(email, verificationURL, user.name);

        return res.status(201).json({
          success: true,
          message:
            "Signup successful. Please check your email to verify your account.",
          userId: user._id,
        });
      } catch (err: any) {
        console.error("Signup error:", err);
        if (err.code === 11000) {
          const field = Object.keys(err.keyPattern)[0];
          return res.status(409).json({ error: `${field} already exists` });
        }
        return res.status(500).json({ error: "Failed to signup" });
      }
    } catch (err) {
      console.error("Signup error:", err);
      return next(err);
    }
  },
);

// Validating Invitation
invitationRouter.get(
  "/:token",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<Response | void> => {
    const { token } = req.params;
    if (!token) {
      return next(createHttpError(HttpCode.BAD_REQUEST, "Token Not Found"));
    }

    const tokenDetails = verifyInvitationToken(token as string);

    if (!tokenDetails.success) {
      console.log("Token verification failed:", tokenDetails.error);
      return next(
        createHttpError(
          HttpCode.BAD_REQUEST,
          tokenDetails.error || "Invalid Token",
        ),
      );
    }

    return res.status(HttpCode.OK).json({
      success: true,
      data: tokenDetails.data,
    });
  },
);

// Sending Invitations
invitationRouter.post(
  "/send",
  authenticate,
  allowRoles("content_access_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = invitationSchema.safeParse(req.body);

      if (!validatedData.success) {
        return next(
          createHttpError(
            HttpCode.BAD_REQUEST,
            fromError(validatedData.error).toString(),
          ),
        );
      }

      console.log("Validated Data:", validatedData.data);
      console.log("Generating Token");
      const invitationToken: string = generateInvitationToken({
        role: validatedData.data.role,
        email: validatedData.data.email,
      });

      console.log("Invitation Token:", invitationToken);

      const invitationLink = `${process.env.CLIENT_URL}/invite/token=${invitationToken}`;
      const emailResponse = await emailServiceApi.post(
        "/api/v1/email/send-invitation",
        {
          ...validatedData.data,
          inviteLink: invitationLink,
          expiresAt: "1h",
        },
      );

      if (emailResponse.status >= 200 && emailResponse.status < 300) {
        return res.status(HttpCode.OK).json({
          success: true,
          message: "Invitation sent successfully",
        });
      }

      return next(
        createHttpError(
          HttpCode.BAD_GATEWAY,
          "Failed to send invitation email",
        ),
      );
    } catch (err) {
      console.error("Invite error:", err);
      return next(err);
    }
  },
);

export default invitationRouter;
