const { prepare } = require('../database');

/**
 * Log admin actions to audit_logs table
 * @param {string} adminId - Admin user ID
 * @param {string} action - Action performed
 * @param {string} targetType - Type of target (user, deposit, order, etc.)
 * @param {string} targetId - Target ID
 * @param {object} details - Additional details object
 * @param {object} req - Express request object (for IP/user-agent)
 */
async function logAudit(adminId, action, targetType, targetId, details = {}, req = null) {
  try {
    const ipAddress = req ? (req.ip || req.headers['x-forwarded-for'] || '') : '';
    const userAgent = req ? (req.headers['user-agent'] || '') : '';
    
    await prepare(`
      INSERT INTO audit_logs (admin_id, action, target_type, target_id, details, ip_address, user_agent, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      adminId,
      action,
      targetType || null,
      targetId || null,
      JSON.stringify(details),
      ipAddress,
      userAgent,
      JSON.stringify({ timestamp: new Date().toISOString() })
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

/**
 * Get audit logs for a specific target
 */
async function getAuditLogs(targetType, targetId, limit = 50) {
  try {
    return await prepare(`
      SELECT al.*, u.email as admin_email, u.full_name as admin_name
      FROM audit_logs al
      JOIN users u ON u.id = al.admin_id
      WHERE al.target_type = ? AND al.target_id = ?
      ORDER BY al.created_at DESC
      LIMIT ?
    `).all(targetType, targetId, limit);
  } catch (err) {
    console.error('Get audit logs error:', err);
    return [];
  }
}

module.exports = { logAudit, getAuditLogs };
