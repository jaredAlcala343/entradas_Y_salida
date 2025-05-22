import { connectToDatabase, sql } from '../../dbconfig';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default async function handler(req, res) {
  console.log('--- INICIO DEL PROCESO DE ELIMINACIÓN ---');
  console.log('Datos recibidos:', JSON.stringify(req.body, null, 2));

  if (req.method !== 'POST') {
    console.log('Error: Método no permitido');
    return res.status(405).json({ message: 'Método no permitido' });
  }

  try {
    // Verificación de contenido JSON
    if (!req.headers['content-type']?.includes('application/json')) {
      console.log('Error: Content-Type no es JSON');
      return res.status(400).json({ message: 'El contenido debe ser JSON' });
    }

    // Manejo flexible de parámetros
    const pedidoId = req.body.numeroPedido || req.body.pedidoId;
    const productoId = req.body.productoId;
    const usuario = req.body.usuarioAutorizacion || req.body.usuario;
    const password = req.body.password;

    console.log('Parámetros procesados:', { 
      pedidoId, 
      productoId, 
      usuario: usuario,
      password: password ? '******' : 'no proporcionado'
    });

    // Validación de parámetros
    if (!pedidoId || !productoId || !usuario || !password) {
      console.log('Error: Faltan parámetros requeridos');
      return res.status(400).json({ 
        message: 'Faltan parámetros requeridos',
        detalles: {
          recibido: {
            numeroPedido: req.body.numeroPedido,
            pedidoId: req.body.pedidoId,
            productoId: req.body.productoId,
            usuarioAutorizacion: req.body.usuarioAutorizacion,
            usuario: req.body.usuario,
            password: req.body.password ? '******' : 'no proporcionado'
          },
          esperado: {
            pedidoId: 'string (o numeroPedido)',
            productoId: 'string',
            usuario: 'string (o usuarioAutorizacion)',
            password: 'string'
          }
        }
      });
    }

    // Conexión a la base de datos
    console.log('Estableciendo conexión a la base de datos...');
    const pool = await connectToDatabase();
    
    // 1. Validar credenciales
    console.log('Validando credenciales para usuario:', usuario);
    const usuarioValido = await pool.request()
      .input('usuario', sql.NVarChar(100), usuario)
      .input('password', sql.NVarChar(100), password)
      .query(`
        SELECT 1 FROM UsuariosLocal 
        WHERE correo = @usuario COLLATE SQL_Latin1_General_CP1_CS_AS
        AND contraseña = @password COLLATE SQL_Latin1_General_CP1_CS_AS
        AND Rol IN ('Admin', 'Supervisor')
      `);

    if (usuarioValido.recordset.length === 0) {
      console.log('Error: Credenciales inválidas');
      return res.status(401).json({ 
        message: 'Credenciales inválidas o permisos insuficientes',
        detalles: {
          usuarioProporcionado: usuario,
          rolesPermitidos: ['Admin', 'Supervisor']
        }
      });
    }

    // 2. Verificar pedido
    console.log(`Buscando pedido ${pedidoId}...`);
    const pedido = await pool.request()
      .input('pedidoId', sql.NVarChar(50), pedidoId)
      .query(`
        SELECT Estatus FROM Pedidos WHERE NumeroPedido = @pedidoId
      `);

    if (pedido.recordset.length === 0) {
      console.log(`Error: Pedido ${pedidoId} no encontrado`);
      return res.status(404).json({ 
        message: `Pedido no encontrado`,
        detalles: {
          pedidoBuscado: pedidoId
        }
      });
    }

    if (pedido.recordset[0].Estatus === 'Recibido') {
      console.log('Error: Pedido ya recibido');
      return res.status(400).json({ 
        message: 'No se pueden eliminar productos de traspasos ya recibidos',
        detalles: {
          estatusActual: 'Recibido'
        }
      });
    }

    // 3. Obtener información del documento y producto
    console.log('Obteniendo información del documento...');
    const documentoInfo = await pool.request()
      .input('pedidoId', sql.NVarChar(50), pedidoId)
      .query(`
        SELECT CIDDOCUMENTO FROM admDocumentos WHERE CFOLIO = @pedidoId
      `);

    if (documentoInfo.recordset.length === 0) {
      console.log(`Error: Documento para pedido ${pedidoId} no encontrado`);
      return res.status(404).json({ 
        message: `Documento asociado al pedido no encontrado`,
        detalles: {
          pedidoAsociado: pedidoId
        }
      });
    }

    const cidDocumento = documentoInfo.recordset[0].CIDDOCUMENTO;

    // 4. Verificar si el producto existe en el pedido
    console.log('Verificando producto en el pedido...');
    const productoEnPedido = await pool.request()
      .input('pedidoId', sql.NVarChar(50), pedidoId)
      .input('productoId', sql.NVarChar(50), productoId)
      .query(`
        SELECT Unidades 
        FROM Pedidos 
        WHERE NumeroPedido = @pedidoId AND Producto = @productoId
      `);

    if (productoEnPedido.recordset.length === 0) {
      console.log(`Error: Producto ${productoId} no está en el pedido ${pedidoId}`);
      return res.status(400).json({ 
        message: `El producto no está en el pedido especificado`,
        detalles: {
          pedido: pedidoId,
          productoBuscado: productoId
        }
      });
    }

    const unidades = productoEnPedido.recordset[0].Unidades;

    // 5. Verificar si hay otros productos en el pedido
    console.log('Verificando otros productos en el pedido...');
    const otrosProductos = await pool.request()
      .input('pedidoId', sql.NVarChar(50), pedidoId)
      .input('productoId', sql.NVarChar(50), productoId)
      .query(`
        SELECT COUNT(*) AS total 
        FROM Pedidos 
        WHERE NumeroPedido = @pedidoId AND Producto != @productoId
      `);

    const esUnicoProducto = otrosProductos.recordset[0].total === 0;

    // 6. Transacción para eliminaciones
    const transaction = new sql.Transaction(pool);
    try {
      console.log('Iniciando transacción de eliminación...');
      await transaction.begin();

      // Eliminar movimientos relacionados con el producto
      console.log('Eliminando movimientos del producto...');
      await new sql.Request(transaction)
        .input('documentoId', sql.Int, cidDocumento)
        .input('productoId', sql.NVarChar(50), productoId)
        .query(`
          DELETE FROM admMovimientos
          WHERE CIDDOCUMENTO = @documentoId
          AND CIDPRODUCTO = @productoId
        `);

      // Eliminar producto de la tabla Pedidos
      console.log('Eliminando producto del pedido...');
      await new sql.Request(transaction)
        .input('pedidoId', sql.NVarChar(50), pedidoId)
        .input('productoId', sql.NVarChar(50), productoId)
        .query(`
          DELETE FROM Pedidos
          WHERE NumeroPedido = @pedidoId
          AND Producto = @productoId
        `);

      // Si era el único producto, eliminar el documento completo
      if (esUnicoProducto) {
        console.log('Eliminando documento completo (era el único producto)...');
        await new sql.Request(transaction)
          .input('documentoId', sql.Int, cidDocumento)
          .query(`
            DELETE FROM admDocumentos
            WHERE CIDDOCUMENTO = @documentoId
          `);
      }

      await transaction.commit();
      console.log('Transacción de eliminación completada con éxito');

      // Generar PDF de auditoría
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const fechaHora = new Date().toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City'
      });

      // Encabezado
      doc.setFontSize(18);
      doc.setTextColor(40);
      doc.text('Registro de Eliminación de Producto', pageWidth / 2, 20, { align: 'center' });

      // Información básica
      doc.setFontSize(12);
      doc.text(`Pedido/Traspaso: ${pedidoId}`, 20, 40);
      doc.text(`Producto eliminado: ${productoId}`, 20, 50);
      doc.text(`Unidades eliminadas: ${unidades}`, 20, 60);
      doc.text(`Documento completo eliminado: ${esUnicoProducto ? 'Sí' : 'No'}`, 20, 70);
      doc.text(`Usuario que realizó la acción: ${usuario}`, 20, 80);
      doc.text(`Fecha y hora: ${fechaHora}`, 20, 90);

      // Detalles técnicos
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`ID Documento: ${cidDocumento}`, 20, 110);
      doc.text(`Sistema: Recepción de Traspasos`, 20, 120);
      doc.text(`IP: ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`, 20, 130);

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text('Este documento es un registro oficial de la operación realizada.', pageWidth / 2, 280, { align: 'center' });

      // Convertir a base64 para enviar al frontend
      const pdfBase64 = doc.output('datauristring').split(',')[1];

      return res.status(200).json({
        success: true,
        message: 'Producto eliminado del pedido correctamente',
        detalles: {
          pedido: pedidoId,
          producto: productoId,
          unidadesEliminadas: unidades,
          documentoEliminado: esUnicoProducto,
          timestamp: new Date().toISOString(),
          pdfBase64: pdfBase64
        }
      });

    } catch (error) {
      if (transaction._aborted === false) {
        try {
          await transaction.rollback();
          console.error('Transacción revertida debido a error:', error.message);
        } catch (rollbackError) {
          console.error('Error al revertir la transacción:', rollbackError.message);
        }
      }
      
      console.error('Error en el proceso de eliminación:', error.message);
      return res.status(500).json({
        message: 'Error al eliminar el producto del pedido',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        detalles: {
          operacion: 'eliminacion_producto_pedido',
          estado: 'fallido'
        }
      });
    }

  } catch (error) {
    console.error('Error en el proceso principal:', error.message);
    return res.status(500).json({
      message: 'Error al procesar la solicitud de eliminación',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      detalles: {
        operacion: 'proceso_eliminacion',
        estado: 'fallido'
      }
    });
  } finally {
    console.log('--- FIN DEL PROCESO DE ELIMINACIÓN ---\n');
  }
}