const helmet = require("helmet"); 
require("dotenv").config();
const session = require("express-session");
const bcrypt = require("bcrypt");

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();
app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "segredo-temporario",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 4
  }
}));
app.use(express.static("public"));

const db = new sqlite3.Database("database.db");

db.run(`
CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao TEXT,
  valor TEXT,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS encomendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    telefone TEXT,
    pagamento TEXT,
    entrega TEXT,
    endereco TEXT,
    produto TEXT,
    quantidade TEXT,
    total TEXT,
    observacao TEXT,
    status TEXT DEFAULT 'Pendente',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);

async function enviarTelegram(mensagem) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;

  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: mensagem
      })
    });
  } catch (erro) {
    console.log("Erro ao enviar Telegram:", erro.message);
  }
}

app.post("/encomendar", (req, res) => {
    console.log("PEDIDO RECEBIDO:", req.body);
   const { nome, telefone, pagamento, entrega, endereco, produto, quantidade, total, observacao } = req.body;
   if (!nome || nome.length > 100) {
  return res.status(400).json({ sucesso: false, erro: "Nome inválido" });
}

const telefoneLimpo = String(telefone).replace(/\D/g, "");

if (!telefoneLimpo || telefoneLimpo.length < 10 || telefoneLimpo.length > 13) {
  return res.status(400).json({ sucesso: false, erro: "Telefone inválido" });
}

if (!produto || produto.length > 500) {
  return res.status(400).json({ sucesso: false, erro: "Produto inválido" });
}

if (!total || total.length > 50) {
  return res.status(400).json({ sucesso: false, erro: "Total inválido" });
}

    db.run(
        `INSERT INTO encomendas
        (nome, telefone, pagamento, entrega, endereco, produto, quantidade, total, observacao)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nome, telefone, pagamento, entrega, endereco, produto, quantidade, total, observacao],
        function(err){
           if(err){
    console.log("ERRO AO SALVAR:", err.message);
    return res.status(500).json({ sucesso:false });
}

enviarTelegram(
`🧁 Novo pedido By Yas!

👤 Cliente: ${nome}
📞 Telefone: ${telefone}
🛍 Produto: ${produto}
💳 Pagamento: ${pagamento}
🚚 Entrega: ${entrega}
💰 ${total}
📝 Observação: ${observacao || "Nenhuma"}`
);

res.json({ sucesso:true });
        }
    );
});

app.get("/encomendas", (req, res) => {
    db.all(
        "SELECT * FROM encomendas WHERE arquivado = 0 OR arquivado IS NULL ORDER BY id DESC",
        [],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ erro: err.message });
            }

            res.json(rows);
        }
    );
});

app.delete("/excluir-todos", (req, res) => {
    db.run("DELETE FROM encomendas", [], function(err) {
        if (err) return res.status(500).json({ erro: "Erro ao excluir tudo" });

        res.json({ sucesso: true });
    });
});

app.delete("/excluir-pedido/:id", (req, res) => {
    db.run(
        "DELETE FROM encomendas WHERE id = ?",
        [req.params.id],
        function(err) {
            if (err) {
                return res.status(500).json({ erro: err.message });
            }

            res.json({ sucesso: true });
        }
    );
});

app.put("/status/:id", (req, res) => {
    const { status } = req.body;
    const { id } = req.params;

    db.run(
        "UPDATE encomendas SET status = ? WHERE id = ?",
        [status, id],
        function(err){
            if(err) return res.status(500).json({ sucesso:false });

            res.json({ sucesso:true });
        }
    );
});

app.get("/api/faturamento-periodo",  (req, res) => {
  const { inicio, fim } = req.query;

  const sql = `
    SELECT SUM(
      CAST(
        REPLACE(
          REPLACE(
            REPLACE(total, '💖 Total: R$', ''),
            'R$', ''
          ),
          ',', '.'
        ) AS REAL
      )
    ) AS faturamento
    FROM encomendas
    WHERE LOWER(status) = 'entregue'
    AND DATE(criado_em) BETWEEN DATE(?) AND DATE(?)
  `;

  db.get(sql, [inicio, fim], (err, row) => {
    if (err) {
        return res.status(500).json({ erro: err.message });
    }

    res.json({
        faturamento: row.faturamento || 0
    });
});

});

app.get("/api/lucro-periodo", (req, res) => {
  const { inicio, fim } = req.query;

  const sql = `
    SELECT
      (SELECT SUM(
        CAST(
          REPLACE(
            REPLACE(
              REPLACE(total, '💖 Total: R$', ''),
              'R$', ''
            ),
            ',', '.'
          ) AS REAL
        )
      )
      FROM encomendas
      WHERE status = 'Entregue'
      AND DATE(criado_em) BETWEEN DATE(?) AND DATE(?)
      ) AS faturamento,

      (SELECT SUM(
        CAST(
          REPLACE(
            REPLACE(valor, 'R$', ''),
            ',', '.'
          ) AS REAL
        )
      )
      FROM gastos
      WHERE DATE(criado_em) BETWEEN DATE(?) AND DATE(?)
      ) AS gastos
  `;

  db.get(sql, [inicio, fim, inicio, fim], (err, row) => {
    if (err) {
      return res.status(500).json({ erro: err.message });
    }

    const faturamento = row.faturamento || 0;
    const gastos = row.gastos || 0;
    const lucro = faturamento - gastos;

    res.json({ faturamento, gastos, lucro });
  });
});


app.post("/gastos", (req, res) => {
  const { descricao, valor } = req.body;

  db.run(
    `INSERT INTO gastos (descricao, valor) VALUES (?, ?)`,
    [descricao, valor],
    function(err) {
      if (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
      }

      res.json({ sucesso: true });
    }
  );
});

app.delete("/gastos", (req, res) => {
  db.run(`DELETE FROM gastos`, [], function(err) {
    if (err) {
      return res.status(500).json({ sucesso: false, erro: err.message });
    }

    res.json({ sucesso: true });
  });
});

db.run(`ALTER TABLE encomendas ADD COLUMN arquivado INTEGER DEFAULT 0`, (err) => {
  if (err && !err.message.includes("duplicate column name")) {
    console.log(err.message);
  }
});

app.put("/arquivar/:id", verificarAuth, (req, res) => {
  const { id } = req.params;

  db.run(
    `UPDATE encomendas SET arquivado = 1 WHERE id = ?`,
    [id],
    function(err) {
      if (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
      }

      res.json({ sucesso: true, alterados: this.changes });
    }
  );
});

app.get("/arquivados", verificarAuth, (req, res) => {
    db.all(
        "SELECT * FROM encomendas WHERE arquivado = 1 ORDER BY id DESC",
        [],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ erro: err.message });
            }

            res.json(rows);
        }
    );
});


app.get("/backup", verificarAuth, (req, res) => {
    const banco = path.join(__dirname, "database.db");

    const data = new Date().toISOString().split("T")[0];
    const nomeArquivo = `backup-doceria-${data}.db`;

    res.download(banco, nomeArquivo);
});

const tentativasLogin = {};

app.post("/login", async (req, res) => {
  const { usuario, senha } = req.body;

  const ip = req.ip;
  const agora = Date.now();

  if (!tentativasLogin[ip]) {
    tentativasLogin[ip] = {
      erros: 0,
      bloqueadoAte: 0
    };
  }

  if (tentativasLogin[ip].bloqueadoAte > agora) {
    return res.status(429).json({
      sucesso: false,
      erro: "Muitas tentativas. Tente novamente mais tarde."
    });
  }

  const senhaCorreta = await bcrypt.compare(
    senha,
    process.env.ADMIN_PASSWORD_HASH
);

if (
    usuario === process.env.ADMIN_USER &&
    senhaCorreta
) {
    tentativasLogin[ip] = {
      erros: 0,
      bloqueadoAte: 0
    };

    req.session.logado = true;
    return res.json({ sucesso: true });
  }

  tentativasLogin[ip].erros++;

  if (tentativasLogin[ip].erros >= 5) {
    tentativasLogin[ip].bloqueadoAte = agora + 15 * 60 * 1000;
  }

  res.status(401).json({
    sucesso: false,
    erro: "Usuário ou senha incorretos."
  });
});

app.get("/verificar-login", (req, res) => {
  res.json({
    logado: req.session.logado === true
  });
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ sucesso: true });
  });
});

function verificarAuth(req, res, next) {
  if (!req.session.logado) {
    return res.status(401).json({
      erro: "Não autorizado"
    });
  }

  next();
}

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});

