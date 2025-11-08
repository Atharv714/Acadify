import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

/**
 * API Route: Refresh MCP data
 * Triggers MCP server to fetch latest data from Google APIs
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // In a real implementation, you would:
    // 1. Call the MCP server via stdio/HTTP
    // 2. Or trigger Cloud Functions that run MCP tools
    // 3. Or use Firebase extensions

    // For now, we'll just return success
    // The real-time listeners will pick up changes automatically
    
    return NextResponse.json({
      success: true,
      message: 'Refresh triggered',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('MCP refresh error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * API Route: Get MCP Dashboard Summary
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // Fetch assignments
    const assignmentsSnapshot = await adminDb
      .collectionGroup('courseWorkMeta')
      .where('uid', '==', userId)
      .orderBy('updatedAt', 'desc')
      .limit(20)
      .get();

    const assignments = assignmentsSnapshot.docs.map((doc: any) => doc.data());

    // Fetch emails
    const emailsSnapshot = await adminDb
      .collection('users')
      .doc(userId)
      .collection('gmail')
      .doc('messages')
      .collection('list')
      .orderBy('updatedAt', 'desc')
      .limit(20)
      .get();

    const emails = emailsSnapshot.docs.map((doc: any) => doc.data());

    // Calculate stats
    const stats = {
      assignments: {
        total: assignments.length,
        due: assignments.filter((a: any) => a.state === 'Due').length,
        missed: assignments.filter((a: any) => a.state === 'Missed').length,
        completed: assignments.filter((a: any) => a.state === 'Completed').length,
      },
      emails: {
        total: emails.length,
        unread: emails.filter((e: any) => e.labelIds?.includes('UNREAD')).length,
      },
    };

    return NextResponse.json({
      stats,
      assignments: assignments.slice(0, 5),
      emails: emails.slice(0, 5),
    });
  } catch (error: any) {
    console.error('MCP summary error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
