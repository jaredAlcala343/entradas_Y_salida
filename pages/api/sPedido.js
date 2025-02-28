import { sql, connectToDatabase } from '../../dbconfig';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    const { numeroPedido } = req.query;

    if (!numeroPedido) {
        return res.status(400).json({ message: 'Número de pedido requerido' });
    }

    try {
        const pool = await connectToDatabase();

        const result = await pool
            .request()
            .input('numeroPedido', sql.VarChar, numeroPedido)
            .query(`
                SELECT 
                    p.NumeroPedido, p.Origen, p.Destino, p.Producto, p.Unidades, 
                    a.CNOMBREPRODUCTO, a.CCODIGOPRODUCTO
                FROM Pedidos p
                INNER JOIN admProductos a ON p.Producto = a.CIDPRODUCTO
                WHERE p.NumeroPedido = @numeroPedido
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Pedido no encontrado' });
        }

        res.status(200).json(result.recordset);
    } catch (error) {
        console.error('Error en la consulta:', error);
        res.status(500).json({ message: 'Error en el servidor' });
    }
}
