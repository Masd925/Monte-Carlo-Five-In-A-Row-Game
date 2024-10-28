$(document).ready(function () {
    // Limiting factor of playing strength is browser memory, so stored nodes hold minimal amount of data.
    // Memory and efficiency optimization means somewhat less elegant code. Using for loops and keeping number of objects and operations low.

    var numPlayers = 2;
    var closebyDistance; // How far from existing moves do we search potential moves at start
    var closebyMoveLimit = Infinity; // When is closebyDistance raised from initial 1
    var marks = { 0: "X", 1: "O" };
    var E = " ";

    var isHashPrunedOnMove = true; // When game move is made, do we get rid off positions that can never occur in the game again. Can use false when testing.

    var boardDimension = 13;
    var centerIndex;
    var numSquares;

    var gameBoard; // " OX X   OX..."
    var gameInTurn; // 0/1
    var gameMovesMade; // 0,1,...
    var gameResult; // 0/0.5/1/null if game has not ended (can be evaluated though)
    var gameIsPlayerToMove; // true/false
    var nodeHash; // board: Node
    // board = "O  XOX X  XOOOX  X"
    // Node = {result:     0,1,.../null,     result is null if game ended in the position
    //         visited:    0,1,...,
    //         evaluation: 0/0.5/1/null}     Evaluation is non-null if game ended here or evaluation was derived
    var engineMoveOrder; // When computer makes a move, potential moves are stored here in order. Later when unplayed moves are chosen, this order is used.
    //  This optimization makes computer consider moves first that were good at previous move, instead of some fixed or random order.
    var numIter; // Number of Monte-Carlo iterations computer simulates before moving

    function initGameData() {
        $("#result_span").text("");
        closebyDistance = 1;
        centerIndex = indexFromCoordinates(
            trunc(boardDimension / 2),
            trunc(boardDimension / 2)
        );
        numSquares = boardDimension * boardDimension;
        gameBoard = E.repeat(numSquares);
        gameInTurn = 0;
        gameMovesMade = 0;
        gameResult = null;
        gameIsPlayerToMove = true;
        nodeHash = {};
        nodeHash[gameBoard] = { result: 0, visited: 0, evaluation: null };
        engineMoveOrder = [];
        thinkingTimeChangeHandler();
    }

    function gameMakeMove(move) {
        if (gameResult !== null)
            throw "Making a move on game that has ended on gameMakeMove";
        if (gameBoard[move] !== E)
            throw (
                "Making illegal move on makeMove, move " +
                move +
                ", position: " +
                gameBoard +
                ", inTurn: " +
                gameInTurn +
                ", result: " +
                result
            );
        gameBoard = replaceCharacterAtIndex(gameBoard, marks[gameInTurn], move);
        gameInTurn = nextInTurn(gameInTurn);
        gameMovesMade++;
        var node = getNodeFromHash(gameBoard);
        if (node !== null) {
            // New position node already exists
            if (node.result === null) gameResult = node.evaluation;
            else gameResult = null;
        } else {
            // New position node needs to be generated
            gameResult = evaluate(
                gameBoard,
                gameMovesMade === numSquares,
                gameInTurn,
                move
            );
            nodeHash[gameBoard] = {
                result: 0,
                visited: 0,
                evaluation: gameResult,
            };
            if (gameResult !== null) nodeHash[gameBoard].result = null;
        }
        if (isHashPrunedOnMove)
            cleanNodeHash(numSquares - gameMovesMade, gameBoard);
        console.log(
            "nNodes: " + Object.keys(nodeHash).length + ", cleaned: " + cleaned
        );
        if (gameMovesMade > closebyMoveLimit) closebyDistance = 2;
    }

    function gameMakeMostVisitedMove() {
        // Makes winning move if found. If board is evaluated, makes a move that has equal evaluation. Otherwise uses M-C equation.
        var node = getNodeFromHash(gameBoard);
        if (gameResult !== null)
            throw "Making move on ended game in gameMakingMostVisitedMove"; // remove?
        var mostVisitedMove = null;
        var maxVisited = -Infinity; // Largest node visited value found so far
        var visitedSum = 0; // Sum of all node visited values
        var nCheckedMoves = 0; // How many nodes have been checked
        var movesInVisitedOrder = []; // Most visited moves in order. Used on later moves when unplayed moves are compared.
        var movesOfEqualEvaluation = []; // If mother node is evaluated, this holds all moves that uphold that evaluation. Most visited of them is played.
        for (var move = 0; move < numSquares; move++) {
            if (gameBoard[move] === E) {
                // Legal move
                var newBoard = replaceCharacterAtIndex(
                    gameBoard,
                    marks[gameInTurn],
                    move
                );
                var childNode = getNodeFromHash(newBoard);
                if (childNode !== null) {
                    // Move node exists
                    if (
                        childNode.evaluation === gameInTurn ||
                        (node.evaluation !== null &&
                            node.evaluation === childNode.evaluation)
                    ) {
                        if (childNode.evaluation === gameInTurn) {
                            gameMakeMove(move);
                            return move;
                        } else {
                            movesOfEqualEvaluation.push({
                                move: move,
                                visited: childNode.visited,
                            });
                        }
                    }
                    nCheckedMoves++;
                    visitedSum += childNode.visited;
                    if (childNode.visited > maxVisited) {
                        mostVisitedMove = move;
                        maxVisited = childNode.visited;
                    }
                    if (childNode.visited > 0)
                        movesInVisitedOrder.push({
                            move: move,
                            visited: childNode.visited,
                        });
                }
            }
        }
        if (movesOfEqualEvaluation.length > 0) {
            maxVisited = -Infinity;
            mostVisitedMove = null;
            for (var i = 0; i < movesOfEqualEvaluation.length; i++) {
                moveObj = movesOfEqualEvaluation[i];
                if (moveObj.visited > maxVisited) {
                    maxVisited = moveObj.visited;
                    mostVisitedMove = moveObj.move;
                }
            }
        } else {
            console.log(
                "Best visited value: maxVisited/visitedAve: " +
                    (maxVisited * (nCheckedMoves - 1)) /
                        (visitedSum - maxVisited) +
                    ", in gameMakeMostVisitedMove"
            );
            movesInVisitedOrder.sort(function (m, n) {
                return n.visited - m.visited;
            });
            //console.log("Moves in visited order: ", JSON.stringify(movesInVisitedOrder));
            engineMoveOrder = movesInVisitedOrder.map(function (obj) {
                return obj.move;
            });
            //console.log("Engine moves in visited order: ", engineMoveOrder);
        }
        if (mostVisitedMove === null) {
            mostVisitedMove = randomArrayElement(boardLegalMoves(board));
        }
        // logging ev
        newBoard = replaceCharacterAtIndex(
            gameBoard,
            marks[gameInTurn],
            mostVisitedMove
        );
        newNoardNode = getNodeFromHash(newBoard);
        console.log(
            "win probability for computer: ",
            1 - newNoardNode.result / newNoardNode.visited
        );

        gameMakeMove(mostVisitedMove);
        return mostVisitedMove;
    }

    function iterateTimes(times, callback) {
        // Returns false if game board was evaluated. Evaluations cascade, so gameboard can be evaluated during iteration.
        var chunk = times / 100;
        console.log("iterating " + times + " times:");
        /*
        for (var i = 0; i < times; i++) {
            if (iterate() === false) {
                return false;
            }
            if (i % 100 === 0) {
                $("#progress").attr("value", Math.round((i / times) * 100));
                console.log("setting: " + Math.round((i / times) * 100));
                setTimeout(5);
            }
            if (i % 5000 === 0) console.log(i);
        }
        callback();
        return true;
        */
        var i = 0;
        function iterateChunk() {
            for (var j = 0; j < chunk; j++) {
                if (i < times) {
                    if (iterate() === false) {
                        callback();
                        return false;
                    }
                    i++;
                } else {
                    callback();
                    return true;
                }
            }
            $("#progress").attr("value", Math.round((i / times) * 100));
            setTimeout(iterateChunk);
        }
        iterateChunk();
    }

    function iterate() {
        // Traverses from node to node until evaluated node is found or new node is generated + playout.
        // Updates node result and visited along node path.
        // Returns false if game board is evaluated and no iteration is needed
        var board = gameBoard;
        var inTurn = gameInTurn;
        var movesMade = gameMovesMade;
        var node = getNodeFromHash(board);
        if (node.evaluation !== null) return false; // No need to iterate because game board is evaluated. Min-max algorithm tells best moves from now on.
        var traverseNodePath = [node];
        do {
            board = traverseStep(board, inTurn, movesMade);
            inTurn = nextInTurn(inTurn);
            movesMade++;
            node = getNodeFromHash(board);
            traverseNodePath.push(node);
        } while (node.evaluation === null && node.visited > 0);
        var evaluation = node.evaluation; // Here node is evaluated or just generated
        if (evaluation === null) evaluation = playout(board, inTurn, movesMade); //New node uses random playout result as evaluation that updates nodes along traverse path
        for (var i = 0; i < traverseNodePath.length; i++) {
            node = traverseNodePath[i];

            node.visited++;
            var inTurnOnArrayNode = (gameInTurn + i) % numPlayers;
            if (node.result !== null)
                node.result += 1 - Math.abs(evaluation - inTurnOnArrayNode);
        }
        return true;
    }

    function traverseStep(board, inTurn, movesMade) {
        // Goes from non-evaluated node to existing or new node. Returns new board, new or evaluated.
        var node = getNodeFromHash(board);
        var bestBoard = null;
        var bestMoveValue = -Infinity; // M-C value
        var allChildrenEvaluated = true;
        var maxChildEvaluation = -Infinity;
        var minChildEvaluation = Infinity;

        var moveArr = engineMoveOrder.slice();
        for (var m = 0; m < board.length; m++) {
            if (engineMoveOrder.indexOf(m) === -1) moveArr.push(m);
        }
        for (var ind = 0; ind < moveArr.length; ind++) {
            var move = moveArr[ind];
            if (board[move] === E) {
                // is empty square = potential closeby move
                var i_move = iFromIndex(move);
                var j_move = jFromIndex(move);
                var closeby = false;
                loop: {
                    var i_max = validateCoordinate(i_move + closebyDistance);
                    var j_max = validateCoordinate(j_move + closebyDistance);
                    for (
                        var i = validateCoordinate(i_move - closebyDistance);
                        i <= i_max;
                        i++
                    ) {
                        for (
                            var j = validateCoordinate(
                                j_move - closebyDistance
                            );
                            j <= j_max;
                            j++
                        ) {
                            if (
                                board[indexFromCoordinates(i, j)] !== E &&
                                !(i === i_move && j === j_move)
                            ) {
                                closeby = true;
                                break loop;
                            }
                        }
                    }
                }
                if (closeby || move === centerIndex) {
                    // Move is closeby to existing move
                    var newBoard = replaceCharacterAtIndex(
                        board,
                        marks[inTurn],
                        move
                    );
                    var childNode = getNodeFromHash(newBoard);
                    if (childNode === null) {
                        // There is no node for closeby move
                        var childEvaluation = evaluate(
                            newBoard,
                            movesMade + 1 === numSquares,
                            nextInTurn(inTurn),
                            move
                        );
                        nodeHash[newBoard] = {
                            result: childEvaluation === null ? 0 : null,
                            visited: 0,
                            evaluation: childEvaluation,
                        };
                        if (childEvaluation === inTurn) {
                            node.evaluation = childEvaluation; // Winning move existence evaluates a position
                        }
                        return newBoard; // Unplayed closeby move was found and chosen
                    }
                    // There is a node for closeby move
                    var ev; // Expected value if closeby move is played
                    var childEvaluation = childNode.evaluation;
                    if (childEvaluation === null) {
                        // Closeby move node not evaluated
                        ev = 1 - childNode.result / childNode.visited;
                        allChildrenEvaluated = false;
                    } else {
                        // Closeby move node is already evaluated
                        if (childEvaluation === inTurn) {
                            // Closeby winning move found
                            node.evaluation = childEvaluation;
                            return newBoard;
                        } // Closeby move not winning
                        ev = 1 - Math.abs(childEvaluation - inTurn);
                        if (allChildrenEvaluated) {
                            if (childEvaluation > maxChildEvaluation)
                                maxChildEvaluation = childEvaluation;
                            if (childEvaluation < minChildEvaluation)
                                minChildEvaluation = childEvaluation;
                        }
                    }
                    var childValue = nodeValue(
                        ev,
                        node.visited,
                        childNode.visited
                    );
                    if (childValue > bestMoveValue) {
                        bestMoveValue = childValue;
                        bestBoard = newBoard;
                    }
                }
            }
        }
        if (allChildrenEvaluated) {
            // Evaluate mother node from evaluated child modes
            node.evaluation =
                inTurn === 0 ? minChildEvaluation : maxChildEvaluation;
        }
        return bestBoard;
    }

    function playout(board, inTurn, movesMade) {
        // Returns evaluation. Starts from position with newly generated node without evaluation
        var evaluation = null;
        while (evaluation === null) {
            var randomIndex = randomArrayElement(boardLegalMoves(board));
            board = replaceCharacterAtIndex(board, marks[inTurn], randomIndex);
            inTurn = nextInTurn(inTurn);
            movesMade++;
            evaluation = evaluate(
                board,
                movesMade === numSquares,
                inTurn,
                randomIndex
            );
        }
        return evaluation;
    }

    function replaceCharacterAtIndex(str, char, index) {
        return str.substr(0, index) + char + str.substr(index + 1);
    }

    function boardLegalMoves(board) {
        var arr = [];
        for (var i = 0; i < board.length; i++) {
            if (board[i] === E) arr.push(i);
        }
        return arr;
    }

    function randomArrayElement(arr) {
        if (arr.length === 0)
            throw "Empty input array on randomArrayElement, arr: " + arr;
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function getNodeFromHash(board) {
        // null if not found
        var node = nodeHash[board];
        if (node !== undefined) return node;
        return null;
    }

    var cleaned = 0;
    function cleanNodeHash(LegalMovesLimit, boardToKeep) {
        // Cleans nodehash from positions that cannot anymore be reached.
        var nodeHashKeys = Object.keys(nodeHash);
        for (var i = 0; i < nodeHashKeys.length; i++) {
            var nodeHashKey = nodeHashKeys[i];
            var legal = nLegalMoves(nodeHashKey);
            if (
                legal > LegalMovesLimit ||
                (legal === LegalMovesLimit && nodeHashKey !== boardToKeep)
            ) {
                delete nodeHash[nodeHashKey];
                cleaned++;
            }
        }
    }

    function nLegalMoves(board) {
        // Number of empty squares on board
        var result = 0;
        for (var i = 0; i < board.length; i++) {
            if (board.charAt(i) === E) result++;
        }
        return result;
    }

    function printNodesAndPositions(num) {
        console.log("****printNodesAndPositions****");
        var hashKeysSorted = Object.keys(nodeHash).sort(function (a, b) {
            return nLegalMoves(b) - nLegalMoves(a);
        });
        var len = hashKeysSorted.length;
        if (num === undefined || num > len) num = len;
        for (var i = 0; i < num; i++) {
            var key = hashKeysSorted[i];
            var n = nodeHash[key];
            console.log(n);
            console.log(textBoard2d(key));
            console.log("visited: ", n.visited);
            console.log("ExpectedValue: ", n.result / n.visited);
        }
        console.log("Number of nodes", len);
        console.log("****printNodesAndPositions****END");
    }

    function indexFromCoordinates(i, j) {
        // Returns undefined if coordinates out of board
        if (i >= 0 && j >= 0 && i < boardDimension && j < boardDimension)
            return i * boardDimension + j;
    }

    function iFromIndex(index) {
        if (isIndexOutOfBoard(index))
            throw "Illegal board index in iFromIndex: " + index;
        return trunc(index / boardDimension);
    }

    function jFromIndex(index) {
        if (isIndexOutOfBoard(index))
            throw "Illegal board index in jFromIndex: " + index;
        return index % boardDimension;
    }

    function trunc(x) {
        return x >> 0;
    }

    function isIndexOutOfBoard(index) {
        return index < 0 || index >= numSquares;
    }

    function validateCoordinate(c) {
        if (c < 0) return 0;
        if (c >= boardDimension) return boardDimension - 1;
        return c;
    }

    function nextInTurn(inTurn) {
        return (inTurn + 1) % numPlayers;
    }

    function nodeValue(ev, parent_visited, visited) {
        // For Monte-Carlo node traversing
        var c = Math.sqrt(2); // Exploration constant
        if (visited === 0) return 999999;
        return ev + c * Math.sqrt(Math.log(parent_visited) / visited);
    }

    function textBoard2d(board) {
        board = board.map(function (char) {
            if (char === E) return ".";
            return char;
        });
        var str = "";
        for (var i = 0; i < boardDimension; i++) {
            str +=
                boardtring.slice(i * boardDimension, (i + 1) * boardDimension) +
                "\n";
        }
        return str;
    }

    function evaluate(board, noMovesLeft, inTurn, lastmove) {
        // returns 0/0.5/1/null
        var lastMoveInTurn = nextInTurn(inTurn);
        var i = iFromIndex(lastmove);
        var j = jFromIndex(lastmove);
        var winningCoordinateCombinations = [
            [
                [-4, 0],
                [1, 0],
            ],
            [
                [-3, 0],
                [1, 0],
            ],
            [
                [-2, 0],
                [1, 0],
            ],
            [
                [-1, 0],
                [1, 0],
            ],
            [
                [0, 0],
                [1, 0],
            ],
            [
                [-4, 4],
                [1, -1],
            ],
            [
                [-3, 3],
                [1, -1],
            ],
            [
                [-2, 2],
                [1, -1],
            ],
            [
                [-1, 1],
                [1, -1],
            ],
            [
                [0, 0],
                [1, -1],
            ],
            [
                [0, 4],
                [0, -1],
            ],
            [
                [0, 3],
                [0, -1],
            ],
            [
                [0, 2],
                [0, -1],
            ],
            [
                [0, 1],
                [0, -1],
            ],
            [
                [0, 0],
                [0, -1],
            ],
            [
                [4, 4],
                [-1, -1],
            ],
            [
                [3, 3],
                [-1, -1],
            ],
            [
                [2, 2],
                [-1, -1],
            ],
            [
                [1, 1],
                [-1, -1],
            ],
            [
                [0, 0],
                [-1, -1],
            ],
            [
                [4, 0],
                [-1, 0],
            ],
            [
                [3, 0],
                [-1, 0],
            ],
            [
                [2, 0],
                [-1, 0],
            ],
            [
                [1, 0],
                [-1, 0],
            ],
            [
                [0, 0],
                [-1, 0],
            ],
            [
                [4, -4],
                [-1, 1],
            ],
            [
                [3, -3],
                [-1, 1],
            ],
            [
                [2, -2],
                [-1, 1],
            ],
            [
                [1, -1],
                [-1, 1],
            ],
            [
                [0, 0],
                [-1, 1],
            ],
            [
                [0, -4],
                [0, 1],
            ],
            [
                [0, -3],
                [0, 1],
            ],
            [
                [0, -2],
                [0, 1],
            ],
            [
                [0, -1],
                [0, 1],
            ],
            [
                [0, 0],
                [0, 1],
            ],
            [
                [-4, 4],
                [1, -1],
            ],
            [
                [-3, 3],
                [1, -1],
            ],
            [
                [-2, 2],
                [1, -1],
            ],
            [
                [-1, 1],
                [1, -1],
            ],
            [
                [0, 0],
                [1, -1],
            ],
        ];
        var win = winningCoordinateCombinations.some(function (arr) {
            var i_diff = arr[0][0];
            var j_diff = arr[0][1];
            var i_inc = arr[1][0];
            var j_inc = arr[1][1];
            for (var k = 0; k < 5; k++) {
                if (
                    board[
                        indexFromCoordinates(
                            i + i_diff + k * i_inc,
                            j + j_diff + k * j_inc
                        )
                    ] !== marks[lastMoveInTurn]
                ) {
                    return false;
                }
            }
            return true;
        });
        var result;
        if (win) result = lastMoveInTurn;
        else if (noMovesLeft) result = 1 / numPlayers;
        else result = null;
        return result;
    }

    function createBoard() {
        var cellWidth = 600 / boardDimension;
        var boardWidth = boardDimension * (cellWidth + 2);

        var grid = $("#grid");
        grid.empty();

        function boardDom() {
            for (var i = 0; i < boardDimension; i++) {
                var row = $("<div></div>");
                row.addClass("row");
                for (var j = 0; j < boardDimension; j++) {
                    var cellContainer =
                        $("<div></div>").addClass("cellContainer");
                    var cell = $("<span></span>").addClass("cell");
                    cell.attr("id", i * boardDimension + j);
                    cellContainer.append(cell);
                    row.append(cellContainer);
                }
                grid.append(row);
            }
        }
        boardDom();
        $("#board").width(boardWidth + "px");
        $("#board").height(boardWidth + 120 + "px");
        $("#grid").width(boardWidth + "px");
        $("#grid").height(boardWidth + 70 + "px");
        $(".row").height(cellWidth + "px");
        $(".cellContainer").width(cellWidth + "px");
        $(".cellContainer").height(cellWidth + "px");
        $(".cell").css("fontSize", cellWidth + "px");
    }

    function renderBoard(id) {
        for (var i = 0; i < boardDimension * boardDimension; i++) {
            $("#" + i).text(gameBoard[i]);
            if (i === id)
                $("#" + i)
                    .parent()
                    .addClass("chosen");
            else
                $("#" + i)
                    .parent()
                    .removeClass("chosen");
        }
    }

    function clickHandler(e) {
        if (gameIsPlayerToMove && gameResult === null) {
            var span = $($(e.target).children()[0]);
            var id = Number(span.attr("id"));
            if (gameBoard[id] === E) {
                gameMakeMove(id);
                renderBoard(id);
                gameIsPlayerToMove = false;
                if (gameResult !== null) {
                    endGame();
                } else {
                    window.setTimeout(engineMoves, 1);
                }
            }
        }
    }

    function engineMoves() {
        removeHandlers();
        var times = numIter * (1 + gameMovesMade / 10);
        if (gameMovesMade === 0) times = times / 10;
        iterateTimes(times, function () {
            var move = gameMakeMostVisitedMove();
            renderBoard(move);
            gameIsPlayerToMove = true;
            if (gameResult !== null) endGame();
            bindHandlers();
        });
    }

    function newGameHandler() {
        initGameData();
        renderBoard();
    }

    function forceMoveHandler() {
        if (gameMovesMade === 0) engineMoves();
    }

    function thinkingTimeChangeHandler() {
        var val = $("#thinking_time_input").val();
        numIter = Math.round(Math.pow(1.5, val)) * 2000;
    }

    function endGame() {
        var resultText;
        if (gameResult === 0.5) resultText = "You drew!";
        else resultText = gameIsPlayerToMove ? "Computer won!" : "You won!";
        $("#result_span").text(resultText);
    }

    function bindHandlers() {
        $("#board").on("click", clickHandler);
        $("#new_game_button").on("click", newGameHandler);
        $("#force_move_button").on("click", forceMoveHandler);
        $("#thinking_time_input").on("change", thinkingTimeChangeHandler);
    }

    function removeHandlers() {
        $("#board").off("click");
        $("#new_game_button").off("click");
        $("#force_move_button").off("click");
        $("#thinking_time_input").off("change");
    }

    initGameData();
    createBoard();
    renderBoard();
    bindHandlers();
});
