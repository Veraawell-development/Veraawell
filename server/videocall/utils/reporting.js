/**
 * Session Reporting Utilities
 * Generates comprehensive reports for video call sessions
 */

const logger = require('./logger');

/**
 * Generate comprehensive session report
 */
async function generateSessionReport(session) {
  try {
    const report = {
      sessionInfo: generateSessionInfo(session),
      participantAnalysis: generateParticipantAnalysis(session),
      technicalMetrics: generateTechnicalMetrics(session),
      qualityAssessment: generateQualityAssessment(session),
      complianceReport: generateComplianceReport(session),
      recommendations: generateRecommendations(session),
      summary: generateSummary(session)
    };
    
    logger.info('Session report generated', {
      sessionId: session.sessionId,
      reportSections: Object.keys(report).length
    });
    
    return report;
    
  } catch (error) {
    logger.error('Error generating session report', {
      sessionId: session.sessionId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Generate basic session information
 */
function generateSessionInfo(session) {
  return {
    sessionId: session.sessionId,
    roomId: session.roomId,
    sessionType: session.sessionType,
    status: session.status,
    scheduledTime: session.scheduledStartTime,
    actualStartTime: session.actualStartTime,
    endTime: session.endTime,
    duration: session.sessionDuration,
    createdAt: session.createdAt
  };
}

/**
 * Generate participant analysis
 */
function generateParticipantAnalysis(session) {
  const participants = session.participants || [];
  
  return {
    totalParticipants: participants.length,
    participantBreakdown: participants.map(p => ({
      role: p.role,
      joinTime: p.joinedAt,
      leaveTime: p.leftAt,
      sessionDuration: p.leftAt ? 
        Math.floor((p.leftAt - p.joinedAt) / 1000) : 
        session.sessionDuration,
      connectionQuality: p.connectionQuality,
      deviceInfo: p.deviceInfo
    })),
    roleDistribution: getRoleDistribution(participants),
    attendanceRate: calculateAttendanceRate(participants, session),
    averageConnectionQuality: calculateAverageConnectionQuality(participants)
  };
}

/**
 * Generate technical metrics
 */
function generateTechnicalMetrics(session) {
  const metrics = session.metrics || {};
  const technical = session.technical || {};
  
  return {
    sessionMetrics: {
      duration: metrics.duration || 0,
      connectionIssues: metrics.connectionIssues || 0,
      reconnections: metrics.reconnections || 0,
      dataTransferred: metrics.dataTransferred || 0,
      averageQuality: metrics.averageQuality || 'unknown'
    },
    technicalDetails: {
      webrtcVersion: technical.webrtcVersion,
      browserSupport: technical.browserSupport,
      iceConnectionState: technical.iceConnectionState,
      signalingState: technical.signalingState,
      errorCount: technical.errors ? technical.errors.length : 0
    },
    performanceIndicators: calculatePerformanceIndicators(session),
    stabilityScore: calculateStabilityScore(session)
  };
}

/**
 * Generate quality assessment
 */
function generateQualityAssessment(session) {
  const participants = session.participants || [];
  const metrics = session.metrics || {};
  
  const qualityScores = participants.map(p => {
    return mapQualityToScore(p.connectionQuality);
  });
  
  const averageScore = qualityScores.length > 0 ? 
    qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length : 0;
  
  return {
    overallQuality: scoreToQuality(averageScore),
    qualityScore: Math.round(averageScore),
    participantQuality: participants.map(p => ({
      role: p.role,
      quality: p.connectionQuality,
      score: mapQualityToScore(p.connectionQuality)
    })),
    qualityTrends: analyzeQualityTrends(session),
    issuesDetected: detectQualityIssues(session),
    recommendations: generateQualityRecommendations(session)
  };
}

/**
 * Generate compliance report
 */
function generateComplianceReport(session) {
  const privacy = session.privacy || {};
  const recording = session.recording || {};
  
  return {
    hipaaCompliance: {
      status: privacy.hipaaCompliant ? 'Compliant' : 'Non-Compliant',
      encryptionEnabled: privacy.encryptionEnabled,
      auditLogEntries: privacy.auditLog ? privacy.auditLog.length : 0,
      lastAuditEntry: privacy.auditLog && privacy.auditLog.length > 0 ? 
        privacy.auditLog[privacy.auditLog.length - 1].timestamp : null
    },
    recordingCompliance: {
      recordingEnabled: recording.enabled,
      consentObtained: recording.consentGiven,
      consentTimestamp: recording.consentTimestamp,
      recordingPath: recording.recordingPath ? '[REDACTED]' : null,
      duration: recording.duration,
      format: recording.format
    },
    dataProtection: {
      dataEncrypted: privacy.encryptionEnabled,
      auditTrailComplete: privacy.auditLog && privacy.auditLog.length > 0,
      complianceScore: calculateComplianceScore(session)
    }
  };
}

/**
 * Generate recommendations
 */
function generateRecommendations(session) {
  const recommendations = [];
  const metrics = session.metrics || {};
  const participants = session.participants || [];
  
  // Connection quality recommendations
  if (metrics.connectionIssues > 3) {
    recommendations.push({
      category: 'Connection Quality',
      priority: 'High',
      issue: 'Multiple connection issues detected',
      recommendation: 'Check network stability and consider upgrading internet connection',
      impact: 'Session quality and user experience'
    });
  }
  
  // Reconnection recommendations
  if (metrics.reconnections > 2) {
    recommendations.push({
      category: 'Network Stability',
      priority: 'Medium',
      issue: 'Multiple reconnections occurred',
      recommendation: 'Investigate network reliability and consider backup connection',
      impact: 'Session continuity'
    });
  }
  
  // Device recommendations
  participants.forEach(p => {
    if (p.connectionQuality === 'poor') {
      recommendations.push({
        category: 'Device Performance',
        priority: 'Medium',
        issue: `Poor connection quality for ${p.role}`,
        recommendation: 'Check device capabilities and close unnecessary applications',
        impact: 'Audio/video quality'
      });
    }
  });
  
  // Recording recommendations
  const recording = session.recording || {};
  if (recording.enabled && !recording.consentGiven) {
    recommendations.push({
      category: 'Compliance',
      priority: 'Critical',
      issue: 'Recording enabled without proper consent',
      recommendation: 'Ensure explicit consent is obtained before recording',
      impact: 'Legal compliance and patient trust'
    });
  }
  
  return recommendations;
}

/**
 * Generate session summary
 */
function generateSummary(session) {
  const participants = session.participants || [];
  const metrics = session.metrics || {};
  
  const successRate = calculateSessionSuccessRate(session);
  const qualityRating = calculateOverallQuality(session);
  
  return {
    sessionSuccess: successRate >= 80,
    successRate: `${successRate}%`,
    overallRating: qualityRating,
    keyMetrics: {
      duration: formatDuration(session.sessionDuration),
      participants: participants.length,
      connectionIssues: metrics.connectionIssues || 0,
      averageQuality: metrics.averageQuality || 'unknown'
    },
    highlights: generateHighlights(session),
    concerns: generateConcerns(session),
    nextSteps: generateNextSteps(session)
  };
}

// Helper functions

function getRoleDistribution(participants) {
  const distribution = {};
  participants.forEach(p => {
    distribution[p.role] = (distribution[p.role] || 0) + 1;
  });
  return distribution;
}

function calculateAttendanceRate(participants, session) {
  if (participants.length === 0) return 0;
  
  const totalExpectedDuration = session.sessionDuration * participants.length;
  const actualDuration = participants.reduce((sum, p) => {
    const duration = p.leftAt ? 
      Math.floor((p.leftAt - p.joinedAt) / 1000) : 
      session.sessionDuration;
    return sum + duration;
  }, 0);
  
  return Math.round((actualDuration / totalExpectedDuration) * 100);
}

function calculateAverageConnectionQuality(participants) {
  if (participants.length === 0) return 'unknown';
  
  const qualityScores = participants.map(p => mapQualityToScore(p.connectionQuality));
  const average = qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length;
  
  return scoreToQuality(average);
}

function mapQualityToScore(quality) {
  const qualityMap = {
    'excellent': 100,
    'good': 75,
    'fair': 50,
    'poor': 25,
    'unknown': 0
  };
  return qualityMap[quality] || 0;
}

function scoreToQuality(score) {
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  if (score >= 25) return 'poor';
  return 'unknown';
}

function calculatePerformanceIndicators(session) {
  const metrics = session.metrics || {};
  
  return {
    stabilityIndex: Math.max(0, 100 - (metrics.connectionIssues * 10) - (metrics.reconnections * 5)),
    qualityIndex: mapQualityToScore(metrics.averageQuality),
    reliabilityIndex: session.status === 'ended' ? 100 : 50,
    overallPerformance: 0 // Will be calculated based on above indices
  };
}

function calculateStabilityScore(session) {
  const metrics = session.metrics || {};
  let score = 100;
  
  // Deduct points for issues
  score -= (metrics.connectionIssues || 0) * 5;
  score -= (metrics.reconnections || 0) * 3;
  
  // Bonus for successful completion
  if (session.status === 'ended' && session.sessionDuration > 300) { // 5+ minutes
    score += 10;
  }
  
  return Math.max(0, Math.min(100, score));
}

function analyzeQualityTrends(session) {
  // This would analyze quality changes over time
  // For demo purposes, return basic analysis
  return {
    trend: 'stable',
    degradationPoints: 0,
    improvementPoints: 0,
    overallDirection: 'neutral'
  };
}

function detectQualityIssues(session) {
  const issues = [];
  const metrics = session.metrics || {};
  
  if (metrics.connectionIssues > 2) {
    issues.push('Multiple connection interruptions');
  }
  
  if (metrics.reconnections > 1) {
    issues.push('Network instability detected');
  }
  
  return issues;
}

function generateQualityRecommendations(session) {
  const recommendations = [];
  const metrics = session.metrics || {};
  
  if (metrics.averageQuality === 'poor' || metrics.averageQuality === 'fair') {
    recommendations.push('Consider upgrading internet connection or using wired connection');
    recommendations.push('Close unnecessary applications to free up system resources');
  }
  
  return recommendations;
}

function calculateComplianceScore(session) {
  let score = 0;
  const privacy = session.privacy || {};
  const recording = session.recording || {};
  
  if (privacy.hipaaCompliant) score += 40;
  if (privacy.encryptionEnabled) score += 30;
  if (privacy.auditLog && privacy.auditLog.length > 0) score += 20;
  if (!recording.enabled || recording.consentGiven) score += 10;
  
  return score;
}

function calculateSessionSuccessRate(session) {
  let score = 0;
  
  // Basic completion
  if (session.status === 'ended') score += 40;
  
  // Duration (minimum 5 minutes for therapy session)
  if (session.sessionDuration >= 300) score += 30;
  
  // Quality
  const avgQuality = session.metrics?.averageQuality;
  if (avgQuality === 'excellent' || avgQuality === 'good') score += 20;
  
  // Low issues
  const issues = (session.metrics?.connectionIssues || 0) + (session.metrics?.reconnections || 0);
  if (issues <= 2) score += 10;
  
  return Math.min(100, score);
}

function calculateOverallQuality(session) {
  const participants = session.participants || [];
  const avgConnectionQuality = calculateAverageConnectionQuality(participants);
  const stabilityScore = calculateStabilityScore(session);
  
  const overallScore = (mapQualityToScore(avgConnectionQuality) + stabilityScore) / 2;
  return scoreToQuality(overallScore);
}

function generateHighlights(session) {
  const highlights = [];
  
  if (session.status === 'ended') {
    highlights.push('Session completed successfully');
  }
  
  if (session.sessionDuration >= 1800) { // 30+ minutes
    highlights.push('Extended therapy session duration');
  }
  
  const avgQuality = session.metrics?.averageQuality;
  if (avgQuality === 'excellent' || avgQuality === 'good') {
    highlights.push('High audio/video quality maintained');
  }
  
  return highlights;
}

function generateConcerns(session) {
  const concerns = [];
  const metrics = session.metrics || {};
  
  if (metrics.connectionIssues > 3) {
    concerns.push('Multiple connection interruptions affected session quality');
  }
  
  if (session.sessionDuration < 300) { // Less than 5 minutes
    concerns.push('Session duration was shorter than expected');
  }
  
  const recording = session.recording || {};
  if (recording.enabled && !recording.consentGiven) {
    concerns.push('Recording consent not properly documented');
  }
  
  return concerns;
}

function generateNextSteps(session) {
  const nextSteps = [];
  
  if (session.sessionType === 'therapy') {
    nextSteps.push('Schedule follow-up therapy session');
    nextSteps.push('Review session notes and patient progress');
  }
  
  const concerns = generateConcerns(session);
  if (concerns.length > 0) {
    nextSteps.push('Address technical issues before next session');
  }
  
  return nextSteps;
}

function formatDuration(seconds) {
  if (!seconds) return '0 seconds';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

module.exports = {
  generateSessionReport,
  generateSessionInfo,
  generateParticipantAnalysis,
  generateTechnicalMetrics,
  generateQualityAssessment,
  generateComplianceReport,
  generateRecommendations,
  generateSummary
};
