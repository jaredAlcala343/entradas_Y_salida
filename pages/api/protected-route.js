import authMiddleware from '../../../middleware/auth';

export default async function handler(req, res) {
  authMiddleware(req, res, async () => {
    res.status(200).json({ message: 'Ruta protegida accedida con éxito', user: { id: req.userId, name: req.userName, role: req.userRole } });
  });
}
