# Revind MCP Server

An intelligent Model Context Protocol (MCP) server that acts as the connective brain between your AI assistant, data sources (Google Classroom, Gmail), and user dashboard.

## Features

- **Real-time Data Sync**: Automatically fetches and caches Classroom courses, assignments, and Gmail messages
- **Smart Alerts**: Monitors upcoming deadlines and missed assignments
- **AI Integration**: Provides tools for AI assistants to query and update user data
- **Contextual Updates**: Streams real-time alerts and notifications

## Architecture

```
┌─────────────────┐
│  AI Assistant   │
│   (Ollama)      │
└────────┬────────┘
         │
         │ MCP Protocol
         │
┌────────▼────────┐
│   MCP Server    │
│  (This Server)  │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼──┐  ┌──▼────┐
│Google│  │Firebase│
│ APIs │  │Firestore│
└──────┘  └────────┘
```

## Setup

1. **Install dependencies:**
   ```bash
   cd mcp-server
   npm install
   ```

2. **Configure environment:**
   Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

   Required variables:
   - `FIREBASE_PROJECT_ID`: Your Firebase project ID
   - `FIREBASE_CLIENT_EMAIL`: Service account email
   - `FIREBASE_PRIVATE_KEY`: Service account private key
   - `GOOGLE_CLIENT_ID`: OAuth client ID
   - `GOOGLE_CLIENT_SECRET`: OAuth client secret

3. **Build and run:**
   ```bash
   npm run build
   npm start
   ```

   Or for development:
   ```bash
   npm run dev
   ```

## MCP Tools

### 1. `get_classroom_courses`
Fetches all active Google Classroom courses for a user.

**Input:**
- `userId`: Firebase user ID
- `accessToken`: Google OAuth access token

**Output:** Array of courses with id, name, section, and link

### 2. `get_course_work`
Fetches assignments/coursework for a specific course.

**Input:**
- `userId`: Firebase user ID
- `courseId`: Classroom course ID
- `accessToken`: Google OAuth access token

**Output:** Array of assignments with due dates and completion status

### 3. `get_gmail_messages`
Fetches Gmail messages with optional filtering.

**Input:**
- `userId`: Firebase user ID
- `accessToken`: Google OAuth access token
- `query`: (Optional) Gmail search query
- `maxResults`: (Optional) Max messages to fetch

**Output:** Array of email messages with metadata

### 4. `get_dashboard_summary`
Comprehensive dashboard overview with stats and recent items.

**Input:**
- `userId`: Firebase user ID

**Output:** Dashboard summary with assignment stats and recent emails

### 5. `stream_alerts`
Real-time alerts for upcoming deadlines and missed assignments.

**Input:**
- `userId`: Firebase user ID

**Output:** Array of alerts with severity levels

## MCP Resources

The server exposes Firestore data as resources:
- `firestore://users/{userId}/classroomCourses`: Cached courses
- `firestore://users/{userId}/gmail/messages/list`: Cached emails

## MCP Prompts

Pre-configured prompts for common AI tasks:
- `summarize_assignments`: Generate assignment summary
- `check_deadlines`: Check for upcoming deadlines

## Integration with Ollama Desktop

Add to your Ollama Desktop config:

```json
{
  "mcpServers": {
    "revind": {
      "command": "node",
      "args": ["/path/to/revind-mcp-server/dist/index.js"],
      "env": {
        "FIREBASE_PROJECT_ID": "your-project-id",
        "FIREBASE_CLIENT_EMAIL": "your-email@project.iam.gserviceaccount.com",
        "FIREBASE_PRIVATE_KEY": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
      }
    }
  }
}
```

## Client Integration

To use the MCP server from your Next.js dashboard:

1. **Real-time listener example:**
   ```typescript
   import { onSnapshot, collection } from 'firebase/firestore';
   
   // Listen for alert updates
   const alertsRef = collection(db, 'users', userId, 'alerts');
   const unsubscribe = onSnapshot(alertsRef, (snapshot) => {
     snapshot.docChanges().forEach((change) => {
       if (change.type === 'added') {
         // Show notification
         toast.warning(change.doc.data().message);
       }
     });
   });
   ```

2. **Polling for updates:**
   ```typescript
   setInterval(async () => {
     const summary = await getDashboardSummary(userId);
     updateUI(summary);
   }, 60000); // Every minute
   ```

## Development

**Watch mode:**
```bash
npm run watch
```

**Type checking:**
```bash
npx tsc --noEmit
```

## Production Deployment

1. Build the server:
   ```bash
   npm run build
   ```

2. Deploy to your server (e.g., AWS, GCP, Heroku)

3. Set environment variables in production

4. Run with process manager:
   ```bash
   pm2 start dist/index.js --name revind-mcp
   ```

## License

MIT
