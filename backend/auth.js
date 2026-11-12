const jwt = require('jsonwebtoken');
function auth(req,res,next){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token) return res.status(401).json({error:'Please sign in first.'});
  try { req.user=jwt.verify(token,process.env.JWT_SECRET || 'dev_only_change_me'); next(); }
  catch { return res.status(401).json({error:'Your session expired. Please sign in again.'}); }
}
function roles(...allowed){return (req,res,next)=>allowed.includes(req.user.role)?next():res.status(403).json({error:'You do not have permission for this action.'});}
module.exports={auth,roles};
