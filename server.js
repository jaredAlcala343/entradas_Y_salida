const next = require("next");
const { createServer } = require("http");

const PORT = process.env.PORT || 3000;

const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    // Redirigir si la ruta es "/"
    if (req.url === "/") {
      res.writeHead(302, { Location: "/" });
      return res.end();
    }

    handle(req, res);
  }).listen(PORT, () => console.log(`Servidor Next.js corriendo en IIS en el puerto ${PORT}`));
});
