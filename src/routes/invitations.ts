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
import Invitation from "../models/Invitation";

import bcrypt from "bcrypt";
import crypto from "crypto";

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12);

const invitationRouter = express.Router();

const invitationSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .transform((val) => val.trim().toLowerCase())
    .refine((email) => email.includes("@"), {
      message: "Invalid email address format",
    })
    .refine((email) => {
      const isValid = email.endsWith("@gmail.com") ||
                      email.endsWith("@extrahand.in") ||
                      email.endsWith("@cognitbotz.com") ||
                      email.endsWith("@trizenventures.com");
      if (!isValid) {
        console.log(`Email validation failed for: "${email}"`);
      }
      return isValid;
    }, {
      message: "Email must end with @gmail.com, @extrahand.in, @cognitbotz.com, or @trizenventures.com",
    }),
  role: z.enum(["reviewer", "writer"]),
});

const emailServiceApi = axios.create({
  baseURL: process.env.EMAIL_SERVICE || "http://localhost:4007",
  headers: {
    "X-Service-Auth": process.env.SERVICE_AUTH_TOKEN || "",
    "X-Service-Name": "content-admin-backend",
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

        // Find and verify invitation exists and is valid
        const invitation = await Invitation.findOne({ 
          token: invitationToken,
          status: 'pending'
        });

        if (!invitation) {
          return res.status(400).json({ 
            error: "Invitation not found or already used" 
          });
        }

        // Check if invitation is expired
        if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
          invitation.status = 'expired';
          await invitation.save();
          return res.status(400).json({ 
            error: "Invitation has expired" 
          });
        }

        if (invitation.email.toLowerCase() !== email.toLowerCase()) {
          return res.status(400).json({ 
            error: "Invitation email does not match" 
          });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        
        // Generate email verification token (24-hour expiry)
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const hashedVerificationToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        
        const user = await User.create({
          name,
          email,
          passwordHash,
          role: userRole,
          status: "APPROVED",
          emailVerified: false, // Email verification required
          emailVerificationToken: hashedVerificationToken,
          emailVerificationExpires: verificationExpires,
        });

        // Mark invitation as accepted
        invitation.status = 'accepted';
        invitation.usedBy = user._id;
        invitation.usedAt = new Date();
        await invitation.save();

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

    // Check invitation status in database
    const invitation = await Invitation.findOne({ token });

    if (!invitation) {
      return next(
        createHttpError(
          HttpCode.NOT_FOUND,
          "Invitation not found",
        ),
      );
    }

    // Check if invitation is revoked
    if (invitation.status === 'revoked') {
      return next(
        createHttpError(
          HttpCode.BAD_REQUEST,
          "This invitation has been revoked",
        ),
      );
    }

    // Check if invitation is already accepted
    if (invitation.status === 'accepted') {
      return next(
        createHttpError(
          HttpCode.BAD_REQUEST,
          "This invitation has already been accepted",
        ),
      );
    }

    // Check if invitation is expired
    if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
      // Mark as expired if not already marked
      if (invitation.status !== 'expired') {
        invitation.status = 'expired';
        await invitation.save();
      }
      return next(
        createHttpError(
          HttpCode.BAD_REQUEST,
          "This invitation has expired",
        ),
      );
    }

    // Check if invitation status is expired
    if (invitation.status === 'expired') {
      return next(
        createHttpError(
          HttpCode.BAD_REQUEST,
          "This invitation has expired",
        ),
      );
    }

    // Verify email matches
    if (invitation.email.toLowerCase() !== tokenDetails.data?.email?.toLowerCase()) {
      return next(
        createHttpError(
          HttpCode.BAD_REQUEST,
          "Invitation email does not match",
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
      // Log the incoming email for debugging
      console.log("Received invitation request:", {
        email: req.body.email,
        role: req.body.role,
        emailType: typeof req.body.email,
        emailLength: req.body.email?.length,
      });

      const validatedData = invitationSchema.safeParse(req.body);

      if (!validatedData.success) {
        console.error("Validation failed:", validatedData.error.issues);
        console.error("Received email value:", JSON.stringify(req.body.email));
        return next(
          createHttpError(
            HttpCode.BAD_REQUEST,
            fromError(validatedData.error).toString(),
          ),
        );
      }

      console.log("Validated Data:", validatedData.data);

      // Check if user already exists
      const existingUser = await User.findOne({ email: validatedData.data.email });
      if (existingUser) {
        return next(
          createHttpError(
            HttpCode.BAD_REQUEST,
            "User with this email already exists",
          ),
        );
      }

      // Check for pending invite that hasn't expired
      const existingInvite = await Invitation.findOne({
        email: validatedData.data.email,
        status: 'pending',
      });

      // Check if invitation is expired by comparing dates
      const isExpired = existingInvite && existingInvite.expiresAt 
        ? new Date(existingInvite.expiresAt) < new Date() 
        : false;

      if (existingInvite && !isExpired) {
        return next(
          createHttpError(
            HttpCode.BAD_REQUEST,
            "Pending invite already exists for this email",
          ),
        );
      }

      // If there's an expired invite, mark it as expired
      if (existingInvite && isExpired) {
        existingInvite.status = 'expired';
        await existingInvite.save();
      }

      console.log("Generating Token");
      const invitationToken: string = generateInvitationToken({
        role: validatedData.data.role,
        email: validatedData.data.email,
      });

      console.log("Invitation Token:", invitationToken);

      const invitationLink = `${process.env.CLIENT_URL}/invite?token=${invitationToken}`;
      
      // Calculate expiration date (1 hour from now)
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour in milliseconds
      
      // Get the current user from the request (invitedBy)
      const invitedBy = (req as any).user?._id || null;

      try {
        const emailResponse = await emailServiceApi.post(
          "/api/v1/email/admin-invite",
          {
            email: validatedData.data.email,
            role: validatedData.data.role,
            inviteLink: invitationLink,
            expiresAt: expiresAt.toISOString(),
            platformName: "Content Admin Portal", // Specify platform name for content admin
          },
        );

        if (emailResponse.status >= 200 && emailResponse.status < 300) {
          // Store invitation in database
          await Invitation.create({
            email: validatedData.data.email,
            role: validatedData.data.role,
            token: invitationToken,
            status: 'pending',
            expiresAt: expiresAt,
            invitedBy: invitedBy,
            emailSent: true,
            emailSentAt: new Date(),
          });

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
      } catch (emailError: any) {
        console.error("Email service error:", emailError);
        
        // Handle axios errors
        if (emailError.response) {
          const status = emailError.response.status;
          const errorMessage = emailError.response.data?.error || emailError.response.data?.message || "Email service error";
          
          if (status === 401) {
            return next(
              createHttpError(
                HttpCode.UNAUTHORIZED,
                "Email service authentication failed. Please check SERVICE_AUTH_TOKEN configuration.",
              ),
            );
          }
          
          return next(
            createHttpError(
              status >= 500 ? HttpCode.BAD_GATEWAY : status,
              `Email service error: ${errorMessage}`,
            ),
          );
        }
        
        // Network or other errors
        return next(
          createHttpError(
            HttpCode.BAD_GATEWAY,
            `Failed to connect to email service: ${emailError.message || "Unknown error"}`,
          ),
        );
      }
    } catch (err) {
      console.error("Invite error:", err);
      return next(err);
    }
  },
);

// List all invitations
invitationRouter.get(
  "/",
  authenticate,
  allowRoles("content_access_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, page = '1', limit = '20' } = req.query;
      
      const query: any = {};
      if (status && status !== 'all') {
        query.status = status;
      }

      const pageNum = parseInt(page as string, 10) || 1;
      const limitNum = parseInt(limit as string, 10) || 20;
      const skip = (pageNum - 1) * limitNum;

      // Get total count
      const total = await Invitation.countDocuments(query);

      // Get paginated invitations
      const invitations = await Invitation.find(query)
        .populate('invitedBy', 'name email')
        .populate('usedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum);

      const totalPages = Math.ceil(total / limitNum);

      return res.status(HttpCode.OK).json({
        success: true,
        data: invitations,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
        },
      });
    } catch (err) {
      console.error("Error fetching invitations:", err);
      return next(err);
    }
  },
);

// Revoke an invitation
invitationRouter.delete(
  "/:id",
  authenticate,
  allowRoles("content_access_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const invitation = await Invitation.findById(id);

      if (!invitation) {
        return next(
          createHttpError(
            HttpCode.NOT_FOUND,
            "Invitation not found",
          ),
        );
      }

      if (invitation.status === 'accepted') {
        return next(
          createHttpError(
            HttpCode.BAD_REQUEST,
            "Cannot revoke an accepted invitation",
          ),
        );
      }

      if (invitation.status === 'revoked') {
        return next(
          createHttpError(
            HttpCode.BAD_REQUEST,
            "Invitation is already revoked",
          ),
        );
      }

      invitation.status = 'revoked';
      await invitation.save();

      return res.status(HttpCode.OK).json({
        success: true,
        message: "Invitation revoked successfully",
      });
    } catch (err) {
      console.error("Error revoking invitation:", err);
      return next(err);
    }
  },
);

export default invitationRouter;
