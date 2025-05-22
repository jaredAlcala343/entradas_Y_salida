import { connectToDatabase, sql } from '../../dbconfig';

export default async function handler(req, res) {
  const { type, usuario, contrasena, numeroPedido } = req.query;

  console.log('--- INICIO API /api/data ---');
  console.log('Método:', req.method, '| type:', type, '| usuario:', usuario, '| numeroPedido:', numeroPedido);

  try {
    const pool = await connectToDatabase();
    console.log('Conexión a base de datos establecida');

    if (req.method !== 'GET') {
      console.log('Método no permitido:', req.method);
      return res.status(405).json({ message: 'Método no permitido' });
    }

    if (!type) {
      console.log('Falta el parámetro "type"');
      return res.status(400).json({ message: 'El parámetro "type" es requerido' });
    }

    switch (type) {
      case 'almacenes': {
        console.log('Obteniendo almacenes...');
        const almacenes = await pool
          .request()
          .query('SELECT CIDALMACEN, CCODIGOALMACEN, CNOMBREALMACEN FROM dbo.admAlmacenes');
        console.log('Almacenes obtenidos:', almacenes.recordset.length);
        return res.status(200).json(almacenes.recordset);
      }

      case 'productos': {
        console.log('Obteniendo productos...');
        const productos = await pool
          .request()
          .query('SELECT CIDPRODUCTO, CCODIGOPRODUCTO, CNOMBREPRODUCTO, CCONTROLEXISTENCIA FROM dbo.admProductos ORDER BY CNOMBREPRODUCTO ASC');
        console.log('Productos obtenidos:', productos.recordset.length);
        return res.status(200).json(productos.recordset);
      }

      case 'productosConCaracteristicas': {
        console.log('Obteniendo productos con características...');
        const productosConCaracteristicas = await pool
          .request()
          .query(`
            SELECT 
              CIDPRODUCTO, 
              CCODIGOPRODUCTO, 
              CNOMBREPRODUCTO,
              CIDPADRECARACTERISTICA1
            FROM dbo.admProductos 
            WHERE CIDPADRECARACTERISTICA1 > 0
            ORDER BY CNOMBREPRODUCTO ASC
          `);
        console.log('Productos con características obtenidos:', productosConCaracteristicas.recordset.length);

        if (numeroPedido) {
          console.log('Procesando productos del pedido:', numeroPedido);
          const productosPedido = await pool
            .request()
            .input('numeroPedido', sql.VarChar, numeroPedido)
            .query(`
              SELECT 
                p.Producto AS CIDPRODUCTO,
                p.nombre_producto,
                ap.CCODIGOPRODUCTO,
                ap.CNOMBREPRODUCTO,
                ap.CIDPADRECARACTERISTICA1,
                p.Unidades
              FROM Pedidos p
              LEFT JOIN admProductos ap ON p.Producto = ap.CIDPRODUCTO
              WHERE p.NumeroPedido = @numeroPedido
            `);
          console.log('Productos del pedido obtenidos:', productosPedido.recordset.length);

          const productosProcesados = productosPedido.recordset.map(productoPedido => {
            // Si el producto tiene código null y nombre_producto empieza con "null,"
            if (
              (!productoPedido.CCODIGOPRODUCTO || productoPedido.CCODIGOPRODUCTO === null) &&
              productoPedido.nombre_producto &&
              productoPedido.nombre_producto.startsWith("null,")
            ) {
              // Buscar el producto padre por el nombre del producto padre en la lista de productos con características
              // Ejemplo: Si el pedido es "null, Granito Blanco", busca el padre "Cubierta Cubytop Antiderrame Cantera"
              // Puedes buscar el padre por el producto anterior en la lista del pedido, o por el producto padre más cercano
              // Aquí lo hacemos por el producto anterior en la lista del pedido que sí tiene código y nombre
              const padreEnPedido = productosPedido.recordset.find(
                p => p.CCODIGOPRODUCTO && p.CNOMBREPRODUCTO
              );
              // O puedes buscar por el producto padre en la lista de características
              // Si tienes una relación, puedes mejorar esta lógica
              let productoPadre = null;
              if (padreEnPedido) {
                productoPadre = productosConCaracteristicas.recordset.find(
                  pc => pc.CNOMBREPRODUCTO && padreEnPedido.CNOMBREPRODUCTO && 
                        pc.CNOMBREPRODUCTO.split(' ')[0] === padreEnPedido.CNOMBREPRODUCTO.split(' ')[0]
                );
              }
              // Si no se encuentra por el anterior, busca por nombre base
              if (!productoPadre) {
                productoPadre = productosConCaracteristicas.recordset[0]; // fallback
              }
              const partes = productoPedido.nombre_producto.split(",");
              const caracteristicas = partes.slice(1).map(c => c.trim()).filter(c => c && c.toLowerCase() !== "null");
              const nombreCompleto = `${productoPadre.CNOMBREPRODUCTO}${caracteristicas.length > 0 ? ', ' + caracteristicas.join(', ') : ''}`;

              return {
                ...productoPedido,
                CNOMBREPRODUCTO: nombreCompleto,
                CCODIGOPRODUCTO: productoPadre.CCODIGOPRODUCTO,
                esProductoConCaracteristicas: true,
                ocultarEnFront: false // Este se muestra
              };
            }

            // Si es el producto padre (de la consulta de características), lo ocultamos en el front
            const productoPadre = productosConCaracteristicas.recordset.find(
              p => p.CCIDPRODUCTO === productoPedido.CIDPRODUCTO ||
                   p.CCODIGOPRODUCTO === productoPedido.CCODIGOPRODUCTO
            );
            if (
              productoPadre &&
              productoPedido.CCODIGOPRODUCTO === productoPadre.CCODIGOPRODUCTO
            ) {
              return {
                ...productoPedido,
                esProductoConCaracteristicas: true,
                ocultarEnFront: true // Este se oculta
              };
            }

            // Producto normal
            return {
              ...productoPedido,
              esProductoConCaracteristicas: false,
              ocultarEnFront: false
            };
          });

          const productosParaFront = productosProcesados.filter(p => !p.ocultarEnFront);
          console.log('Productos procesados para front:', productosParaFront.length);

          return res.status(200).json({
            productosConCaracteristicas: productosConCaracteristicas.recordset,
            productosPedidoProcesados: productosParaFront
          });
        }

        console.log('Retornando solo productos con características');
        return res.status(200).json(productosConCaracteristicas.recordset);
      }

      case 'validarUsuario': {
        console.log('Validando usuario:', usuario);
        if (!usuario || !contrasena) {
          console.log('Faltan usuario o contraseña');
          return res.status(400).json({ message: 'Usuario y contraseña son requeridos' });
        }
        
        const result = await pool
          .request()
          .input('usuario', sql.NVarChar, usuario)
          .input('contrasena', sql.NVarChar, contrasena)
          .query(`
            SELECT 
              u.correo AS usuario,
              u.contraseña,
              u.rol
            FROM dbo.UsuariosLocal u
            WHERE u.correo = @usuario AND u.contraseña = @contrasena
          `);

        if (result.recordset.length === 0) {
          console.log('Credenciales inválidas');
          return res.status(200).json({ 
            valid: false,
            message: 'Credenciales inválidas'
          });
        }

        const userData = result.recordset[0];
        console.log('Usuario validado:', userData.usuario, '| Rol:', userData.rol);
        return res.status(200).json({ 
          valid: true,
          usuario: userData.usuario,
          rol: userData.rol
        });
      }

      default:
        console.log('Tipo de consulta no válido:', type);
        return res.status(400).json({ message: 'Tipo de consulta no válido' });
    }

  } catch (error) {
    console.error('Error en /data:', {
      error: error.message,
      stack: error.stack,
      query: req.query,
      timestamp: new Date().toISOString()
    });
    
    return res.status(500).json({ 
      message: 'Error en el servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      detalles: 'Error al procesar la solicitud'
    });
  }
}