#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import admin from "firebase-admin";
import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();
// Initialize Firebase Admin
const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();
// Initialize Google APIs
const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
// MCP Server
const server = new Server({
    name: "revind-mcp-server",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
        resources: {},
        prompts: {},
    },
});
// ==================== TOOLS ====================
// Tool: Get Classroom Courses
async function getClassroomCourses(userId, accessToken) {
    oauth2Client.setCredentials({ access_token: accessToken });
    const classroom = google.classroom({ version: "v1", auth: oauth2Client });
    const response = await classroom.courses.list({
        studentId: "me",
        courseStates: ["ACTIVE"],
    });
    const courses = response.data.courses || [];
    // Store in Firestore for caching
    const batch = db.batch();
    for (const course of courses) {
        const courseRef = db
            .collection("users")
            .doc(userId)
            .collection("classroomCourses")
            .doc(course.id);
        batch.set(courseRef, {
            id: course.id,
            name: course.name,
            section: course.section,
            descriptionHeading: course.descriptionHeading,
            room: course.room,
            ownerId: course.ownerId,
            enrollmentCode: course.enrollmentCode,
            courseState: course.courseState,
            alternateLink: course.alternateLink,
            teacherGroupEmail: course.teacherGroupEmail,
            courseGroupEmail: course.courseGroupEmail,
            calendarId: course.calendarId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    await batch.commit();
    return courses.map(c => ({
        id: c.id,
        name: c.name,
        section: c.section,
        alternateLink: c.alternateLink,
    }));
}
// Tool: Get Course Work (Assignments)
async function getCourseWork(userId, courseId, accessToken) {
    oauth2Client.setCredentials({ access_token: accessToken });
    const classroom = google.classroom({ version: "v1", auth: oauth2Client });
    const response = await classroom.courses.courseWork.list({
        courseId,
        courseWorkStates: ["PUBLISHED"],
    });
    const courseWork = response.data.courseWork || [];
    // Get course name
    const courseDoc = await db
        .collection("users")
        .doc(userId)
        .collection("classroomCourses")
        .doc(courseId)
        .get();
    const courseName = courseDoc.data()?.name || "Unknown Course";
    // Fetch submissions to determine completion
    const submissions = await classroom.courses.courseWork.studentSubmissions.list({
        courseId,
        courseWorkId: "-", // All coursework
        userId: "me",
    });
    const submissionMap = new Map((submissions.data.studentSubmissions || []).map((s) => [
        s.courseWorkId,
        s.state,
    ]));
    // Store in Firestore
    const batch = db.batch();
    for (const cw of courseWork) {
        const cwRef = db
            .collection("users")
            .doc(userId)
            .collection("classroomCourses")
            .doc(courseId)
            .collection("courseWorkMeta")
            .doc(cw.id);
        const dueDate = cw.dueDate
            ? new Date(cw.dueDate.year, cw.dueDate.month - 1, cw.dueDate.day, cw.dueTime?.hours || 23, cw.dueTime?.minutes || 59).toISOString()
            : null;
        const submissionState = submissionMap.get(cw.id) || "NEW";
        const state = submissionState === "TURNED_IN" || submissionState === "RETURNED"
            ? "Completed"
            : dueDate && new Date(dueDate) < new Date()
                ? "Missed"
                : "Due";
        batch.set(cwRef, {
            uid: userId,
            courseId,
            courseName,
            title: cw.title,
            description: cw.description,
            workType: cw.workType,
            dueDate,
            state,
            alternateLink: cw.alternateLink,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    await batch.commit();
    return courseWork.map(cw => ({
        id: cw.id,
        title: cw.title,
        description: cw.description,
        dueDate: cw.dueDate,
        dueTime: cw.dueTime,
        alternateLink: cw.alternateLink,
        state: submissionMap.get(cw.id) || "NEW",
    }));
}
// Tool: Get Gmail Messages
async function getGmailMessages(userId, accessToken, query = "", maxResults = 25) {
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const response = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults,
    });
    const messages = response.data.messages || [];
    const detailedMessages = [];
    for (const msg of messages) {
        const detail = await gmail.users.messages.get({
            userId: "me",
            id: msg.id,
            format: "metadata",
            metadataHeaders: ["Subject", "From", "Date"],
        });
        const headers = {};
        detail.data.payload?.headers?.forEach((h) => {
            headers[h.name] = h.value;
        });
        detailedMessages.push({
            id: detail.data.id,
            threadId: detail.data.threadId,
            snippet: detail.data.snippet,
            subject: headers["Subject"],
            from: headers["From"],
            date: headers["Date"],
            labelIds: detail.data.labelIds,
        });
    }
    // Cache to Firestore
    const batch = db.batch();
    for (const msg of detailedMessages) {
        const msgRef = db
            .collection("users")
            .doc(userId)
            .collection("gmail")
            .doc("messages")
            .collection("list")
            .doc(msg.id);
        batch.set(msgRef, {
            ...msg,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    await batch.commit();
    return detailedMessages;
}
// Tool: Get User Dashboard Summary
async function getDashboardSummary(userId) {
    // Fetch recent assignments
    const assignmentsSnapshot = await db
        .collectionGroup("courseWorkMeta")
        .where("uid", "==", userId)
        .orderBy("updatedAt", "desc")
        .limit(10)
        .get();
    const assignments = assignmentsSnapshot.docs.map(doc => doc.data());
    // Fetch recent emails
    const emailsSnapshot = await db
        .collection("users")
        .doc(userId)
        .collection("gmail")
        .doc("messages")
        .collection("list")
        .orderBy("updatedAt", "desc")
        .limit(10)
        .get();
    const emails = emailsSnapshot.docs.map(doc => doc.data());
    // Count stats
    const dueAssignments = assignments.filter(a => a.state === "Due").length;
    const missedAssignments = assignments.filter(a => a.state === "Missed").length;
    const completedAssignments = assignments.filter(a => a.state === "Completed").length;
    return {
        assignments: {
            total: assignments.length,
            due: dueAssignments,
            missed: missedAssignments,
            completed: completedAssignments,
            recent: assignments.slice(0, 5),
        },
        emails: {
            total: emails.length,
            recent: emails.slice(0, 5),
        },
    };
}
// Tool: Stream Alerts (Real-time updates)
async function streamAlerts(userId) {
    const alerts = [];
    // Check for upcoming deadlines (next 24 hours)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const assignmentsSnapshot = await db
        .collectionGroup("courseWorkMeta")
        .where("uid", "==", userId)
        .where("state", "==", "Due")
        .get();
    for (const doc of assignmentsSnapshot.docs) {
        const data = doc.data();
        if (data.dueDate) {
            const dueDate = new Date(data.dueDate);
            const now = new Date();
            const hoursDiff = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
            if (hoursDiff > 0 && hoursDiff <= 24) {
                alerts.push({
                    type: "deadline",
                    severity: "high",
                    title: `${data.title} due soon`,
                    message: `Due in ${Math.round(hoursDiff)} hours`,
                    courseName: data.courseName,
                    dueDate: data.dueDate,
                    link: data.alternateLink,
                });
            }
        }
    }
    // Check for missed assignments
    const missedSnapshot = await db
        .collectionGroup("courseWorkMeta")
        .where("uid", "==", userId)
        .where("state", "==", "Missed")
        .limit(5)
        .get();
    for (const doc of missedSnapshot.docs) {
        const data = doc.data();
        alerts.push({
            type: "missed",
            severity: "critical",
            title: `Missed: ${data.title}`,
            message: `This assignment was due on ${new Date(data.dueDate).toLocaleDateString()}`,
            courseName: data.courseName,
            link: data.alternateLink,
        });
    }
    return alerts;
}
// Register MCP Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "get_classroom_courses",
                description: "Fetch all active Google Classroom courses for a user",
                inputSchema: {
                    type: "object",
                    properties: {
                        userId: { type: "string", description: "Firebase user ID" },
                        accessToken: { type: "string", description: "Google OAuth access token" },
                    },
                    required: ["userId", "accessToken"],
                },
            },
            {
                name: "get_course_work",
                description: "Fetch assignments/coursework for a specific course",
                inputSchema: {
                    type: "object",
                    properties: {
                        userId: { type: "string", description: "Firebase user ID" },
                        courseId: { type: "string", description: "Google Classroom course ID" },
                        accessToken: { type: "string", description: "Google OAuth access token" },
                    },
                    required: ["userId", "courseId", "accessToken"],
                },
            },
            {
                name: "get_gmail_messages",
                description: "Fetch Gmail messages with optional query filter",
                inputSchema: {
                    type: "object",
                    properties: {
                        userId: { type: "string", description: "Firebase user ID" },
                        accessToken: { type: "string", description: "Google OAuth access token" },
                        query: { type: "string", description: "Gmail search query (optional)" },
                        maxResults: { type: "number", description: "Max messages to fetch (default 25)" },
                    },
                    required: ["userId", "accessToken"],
                },
            },
            {
                name: "get_dashboard_summary",
                description: "Get comprehensive dashboard summary with assignments and emails",
                inputSchema: {
                    type: "object",
                    properties: {
                        userId: { type: "string", description: "Firebase user ID" },
                    },
                    required: ["userId"],
                },
            },
            {
                name: "stream_alerts",
                description: "Get real-time alerts for upcoming deadlines and missed assignments",
                inputSchema: {
                    type: "object",
                    properties: {
                        userId: { type: "string", description: "Firebase user ID" },
                    },
                    required: ["userId"],
                },
            },
        ],
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        if (!args) {
            throw new Error("Missing arguments");
        }
        switch (name) {
            case "get_classroom_courses":
                const courses = await getClassroomCourses(args.userId, args.accessToken);
                return {
                    content: [{ type: "text", text: JSON.stringify(courses, null, 2) }],
                };
            case "get_course_work":
                const courseWork = await getCourseWork(args.userId, args.courseId, args.accessToken);
                return {
                    content: [{ type: "text", text: JSON.stringify(courseWork, null, 2) }],
                };
            case "get_gmail_messages":
                const messages = await getGmailMessages(args.userId, args.accessToken, args.query || "", args.maxResults || 25);
                return {
                    content: [{ type: "text", text: JSON.stringify(messages, null, 2) }],
                };
            case "get_dashboard_summary":
                const summary = await getDashboardSummary(args.userId);
                return {
                    content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
                };
            case "stream_alerts":
                const alerts = await streamAlerts(args.userId);
                return {
                    content: [{ type: "text", text: JSON.stringify(alerts, null, 2) }],
                };
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (error) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});
// ==================== RESOURCES ====================
server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
        resources: [
            {
                uri: "firestore://users/{userId}/classroomCourses",
                name: "Classroom Courses",
                description: "Cached Google Classroom courses",
                mimeType: "application/json",
            },
            {
                uri: "firestore://users/{userId}/gmail/messages/list",
                name: "Gmail Messages",
                description: "Cached Gmail messages",
                mimeType: "application/json",
            },
        ],
    };
});
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    if (uri.startsWith("firestore://")) {
        const path = uri.replace("firestore://", "");
        const snapshot = await db.doc(path).get();
        if (snapshot.exists) {
            return {
                contents: [
                    {
                        uri,
                        mimeType: "application/json",
                        text: JSON.stringify(snapshot.data(), null, 2),
                    },
                ],
            };
        }
    }
    throw new Error(`Resource not found: ${uri}`);
});
// ==================== PROMPTS ====================
server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
        prompts: [
            {
                name: "summarize_assignments",
                description: "Summarize upcoming and missed assignments",
                arguments: [
                    {
                        name: "userId",
                        description: "Firebase user ID",
                        required: true,
                    },
                ],
            },
            {
                name: "check_deadlines",
                description: "Check for upcoming deadlines in the next 24 hours",
                arguments: [
                    {
                        name: "userId",
                        description: "Firebase user ID",
                        required: true,
                    },
                ],
            },
        ],
    };
});
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name === "summarize_assignments") {
        const summary = await getDashboardSummary(args?.userId);
        return {
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `Please summarize the following assignments:\n\n${JSON.stringify(summary.assignments, null, 2)}`,
                    },
                },
            ],
        };
    }
    if (name === "check_deadlines") {
        const alerts = await streamAlerts(args?.userId);
        return {
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `Here are the upcoming deadlines and alerts:\n\n${JSON.stringify(alerts, null, 2)}`,
                    },
                },
            ],
        };
    }
    throw new Error(`Unknown prompt: ${name}`);
});
// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Revind MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
