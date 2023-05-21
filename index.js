const { Server } = require("socket.io");
const io = new Server({ cors: {
  origin: '*',
  // origin: 'https://study-on-production.up.railway.app/',
}});

io.listen(process.env.PORT);

//socket.leave - Tira um usuário da sala
//socket join - coloca o usuário na sala
//io.sockets.in(room).emit('destino', 'mensagem') //envia dados em determinada sala (todos recebem, exceto quem envia)
//io.sockets.to(room).emit('destino', 'mensagem') //envia dados em determinada sala (todos recebem)

const quiz = JSON.parse( require('fs').readFileSync('quiz.json') )

// let registerAnswers = []
let roomsInGame = []
io.on('connection', socket => {
  //Usuário entra no game
  socket.on("join_game", username => {
    //Estrutura do ticket para o usuario
    const newTicket = {
      id_game: socket.id,
      id_quiz: 1,
      current_question: -1,
      num_questions: quiz.length,
      users: [{
        username: username,
        answers_correct: 0,
        answers_incorrect: 0
      }],
      ready: false
    };

  
    if(roomsInGame.length > 0){
      createNewGameTicket = true;
      roomsInGame.some(ticket => {
        if(!ticket['users'].find(user => user.username === username))
        {
          if(ticket['users'].length < 2) //se menor que 2, é porque tem um esperando
          { 
            createNewGameTicket = false;
            socket.join(ticket.id_game)
            ticket['users'].push({
              username: username,
              answers_correct: 0,
              answers_incorrect: 0
            })

            ticket.ready = true //Responde a inicialização do game para o front
            io.sockets.to(newTicket.id_game).emit("join_game", { ticket: ticket });
            console.log(ticket['users'])
          }
        }else{
          console.log("Você já esta em jogo")
        }
      })

      if(createNewGameTicket){ 
        //se estiver cheio criar novo ticket
        roomsInGame.push(newTicket);
        io.sockets.to(newTicket.id_game).emit("join_game", { ticket: newTicket });
      }
    }else{
      roomsInGame.push(newTicket);
      socket.join(newTicket.id_game)
      io.sockets.to(newTicket.id_game).emit("join_game", { ticket: newTicket });
    }
  })

  //Começa o jogo
  socket.on("control_question", ({ ticket, user }) => {
    controlQuestion(ticket, user)
  })

  const controlQuestion = (ticket, user) => {
    if(ticket.ready){

      roomsInGame.some((game) => {
        if(game.id_game === ticket.id_game){  
          if(ticket.current_question < ticket.num_questions-1)
          {
            //Envia uma nova questão    
            let next = game.current_question = game.current_question+1

            const newTicket = {
              ticket: game,
              next_question: true, 
              question: {
                id_question: quiz[next].id,
                title: quiz[next].title,
                alternatives: quiz[next].alternatives
              },
              user
            }
            
            io.sockets.to(ticket.id_game).emit("control_question", newTicket)
            controlTimeQuestion(game, true, "to_answer", user) //Envia a contagem regressiva

          }else{
            //Escopo fim de jogo
            let resumeGame
            let currentUser
            let opponentUser
            roomsInGame.find((game, indexRoom) => {
              game['users'].find((ticket_user, indexUser) => { 
                if(ticket_user.username === user){ 
                  currentUser = {
                    points: roomsInGame[indexRoom]['users'][indexUser].answers_correct,
                    username: roomsInGame[indexRoom]['users'][indexUser].username
                  }

                }else{
                  opponentUser = {
                    points: roomsInGame[indexRoom]['users'][indexUser].answers_correct,
                    username: roomsInGame[indexRoom]['users'][indexUser].username
                  };
                }
              })   
            })
            
            //Ganhador
            if(currentUser.points > opponentUser.points){

              resumeGame = {
                winner: currentUser.username,
                winnerPoints: currentUser.points,
                loser: opponentUser.username,
                loserPoints: opponentUser.points,
                draw: false
              }
              
            }

            //Perdedor
            if(currentUser.points < opponentUser.points){
              resumeGame = {
                winner: opponentUser.username,
                winnerPoints: opponentUser.points,
                loser: currentUser.username,
                loserPoints: currentUser.points,
                draw: false
              }
            }

            //Empate
            if(currentUser.points === opponentUser.points){
              resumeGame = { draw: true }
            }

            console.log("fim de jogo")
            io.sockets.to(ticket.id_game).emit("control_question", {
              ticket: game,
              game_over: true,
              resume_game: resumeGame,
              next_question: false
            })




          }
        }
      })
    }else{
      io.sockets.to(ticket.id_game).emit("control_question", "start")
    }
  }

  const controlTimeQuestion = (ticket, start, type_time, user) => {
    if(start, type_time === "to_answer"){
      let count = 15; //Contagem para responder a pergunta
      const interval = setInterval(() => {
        if(count === 0){
          clearInterval(interval)
          controlQuestion(ticket, user)
        }else{
          io.sockets.to(ticket.id_game).emit("control_time", ({ 
            ticket,
            start, 
            type_time,
            count 
          }))
        }
        count-- 
      }, 1000)
    }
  }

  //envia resposta e envia nova questão se disponível para ambos
  socket.on("control_answer", ({ ticket, id_question, id_answer, user }) => {
    if(id_answer !== null){
      roomsInGame.find((game, indexRoom) => {
        if(game.id_game === ticket.id_game){
          if(quiz[id_question-1].correct === id_answer)
          {
            game['users'].map((ticket_user, indexUser) => {
              if(ticket_user.username === user) 
                roomsInGame[indexRoom]['users'][indexUser].answers_correct++
            }) 
            io.sockets.to(ticket.id_game).emit("control_answer", ({
              ticket,
              result: "correct",
              id_answer: id_answer,
              id_question,
              user
            }));
          }else
          {
            game['users'].map((ticket_user, indexUser) => {
              if(ticket_user.username === user) 
              roomsInGame[indexRoom]['users'][indexUser].answers_incorrect++
            })   
            io.sockets.to(ticket.id_game).emit("control_answer", ({
              ticket,
              result: "incorrect",
              id_answer: id_answer,
              id_question,
              user
            }));
          }
        }else{
          //remover usuário se o ticket for incorreto
        }
      })
    }
  })

  socket.on('disconnect', () => {
    console.log('🔥: Um jogador se desconectou');
    //Updates the list of users when a user disconnects from the server
    // users = roomsInGame.filter((user) => user.socketID !== socket.id);

    // console.log(users);
    //Sends the list of users to the client
    // socketIO.emit('newUserResponse', users);
    socket.disconnect();
  })
});