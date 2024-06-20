<?php
// Configuración de la DB
$host = '';  
$dbname = '';
$username = ''; 
$password = ''; 

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Obtener los datos enviados por el cliente
    $input = json_decode(file_get_contents('php://input'), true);
    $city = $input['city'];
    $date = $input['date'];

    // Insertar los datos en la base de datos
    $insertQuery = $pdo->prepare('INSERT INTO cities (city, date) VALUES (:city, :date)');
    $insertQuery->bindValue(':city', $city, PDO::PARAM_STR);
    $insertQuery->bindValue(':date', $date, PDO::PARAM_STR);
    $insertQuery->execute();

    $response = ['message' => 'Datos guardados exitosamente'];
} catch (PDOException $e) {
    $response = ['error' => 'Error al guardar los datos: ' . $e->getMessage()];
}

// Enviar la respuesta
header('Content-Type: application/json');
echo json_encode($response);
?>
