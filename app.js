const express = require('express')
const { path } = require('express/lib/application')
const fs = require('fs')
const xlsx = require('node-xlsx')
const mysql = require('mysql')
const app = express()
const port = 3000
const bodyparser = require('body-parser')
const jbt = require('jsonwebtoken')
const cookieParser = require("cookie-parser")
const { send } = require('process')
const novel_text_dir = './resources/'


function getToday(){
	let today = new Date().toLocaleString('zh', {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'}).replaceAll('/', '-')
	return today
}


app.use(cookieParser())
app.use(bodyparser.json())
app.use(bodyparser.urlencoded({extended: true}))
app.all("*", function (req, res, next) {
	//设置允许跨域的域名，*代表允许任意域名跨域
	res.header("Access-Control-Allow-Origin", req.headers.origin);
	//允许的header类型
	res.header("Access-Control-Allow-Headers", "content-type");
	//跨域允许的请求方式 
	res.header("Access-Control-Allow-Methods", "DELETE,PUT,POST,GET,OPTIONS");
	res.header("Access-Control-Allow-Credentials", true); 
	if (req.method == 'OPTIONS')
		res.sendStatus(200); //让options尝试请求快速结束
	else
		next();
})

const connection = mysql.createConnection({
	host: 'localhost',
	user: 'root',
	password: '123456',
	database: 'novel'
})

connection.connect()

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.get('/book', (req,res) => {
	book_id = req.query.id
	connection.query(`SELECT * FROM NOVELS WHERE ID = ${book_id}`, function(err, results, fields){
		if (err) {
			res.json('resource not found')
		}
		console.log('the res is: ', results);
		res.json(results)
	})
})

app.get('/chapterList', (req, res)=>{
	book_id = req.query.id
	connection.query(`SELECT CHAPTER_ID, CHAPTER_NAME FROM CHAPTERS WHERE NOVEL_ID=${book_id}`, function(err,results, fields){
		if (err) {
			console.log(err)
		}
		res.json(results)
	})
})


app.get('/bookstore', (req, res)=>{
	console.log(req.cookies.user_id);
	if(req.cookies.user_id!=undefined){
		let user_id = req.cookies.user_id
		connection.query(`SELECT id, add_date, name, cover_path FROM collection JOIN novels ON collection.book_id = novels.id WHERE collection.user_id = ${user_id}`, (err, results)=>{
			if(err) throw err
			res.json(results)
		})
	}else{
		console.log('unlogin');
	}
	return;
})

app.get('/novellist', (req,res) => {
	connection.query('SELECT * FROM NOVELS LIMIT 0,4', function(err, results, fields){
		if (err) throw err
		res.json(results)
	})
})

app.get('/hotlist', (req,res) => {
	connection.query('SELECT * FROM NOVELS LIMIT 1,20', function(err, results, fields){
		if (err) throw err
		res.json(results)
	})
})

app.get('/chapter', (req, res)=>{
	chapter_id = req.query.id
	connection.query(`select text_path, chapter_name from chapters INNER JOIN novels on chapters.NOVEL_ID = novels.id WHERE CHAPTER_ID=${chapter_id}`, (err, results, fields)=>{
		if (err) {
			console.log(err)
		}
		chapter_name = results[0].chapter_name
		results[0].text_path = results[0].text_path+'/'+chapter_id+'.txt'
		file_path = results[0]
		local_path = novel_text_dir+file_path.text_path
		if(fs.existsSync(local_path)){
			fs.readFile(local_path, (err, result)=>{
				if(err) throw err
				let resData = {
					chapter_name: chapter_name,
					content: result.toString()
				}
				res.json(resData)
			})
		}
	})

})

app.get('/cover', (req, res)=>{
	imgName = req.query.pic
	fullPath = './resources/cover_img/'+imgName+'.png'
	if(fs.existsSync(fullPath)==false){
		res.json('not such resources')
		res.end
	}
	res.set('content-type', {"png": "image/png", "jpg": "image/jpeg"})
	let stream = fs.createReadStream(fullPath)
	let responeImg = []
	if(stream){
		stream.on('data', chunk=>{
			responeImg.push(chunk)
		})
		stream.on('end', ()=>{
			let finalData = Buffer.concat(responeImg)
			res.write(finalData)
			res.end()
		})
	}
})

app.get('/getjson', (req,res)=>{
	let sheets = xlsx.parse(fs.readFileSync('./data.xlsx'))
	let arr = []
	res.json(sheets[0])
	// const workbook = xlsx.readFile("./data.xlsx")
	// let sheetName = workbook.SheetNames[0]
	// let sheet = workbook.Sheets[sheetName]
	// console.log(xlsx.utils.sheet_to_json(sheet));
})

app.post('/addBook', (req, res)=>{
	if(req.cookies.user_id==undefined){
		res.statusCode == 401
		res.end()
		return
	}
	connection.query(`INSERT INTO COLLECTION(BOOK_ID, USER_ID, ADD_DATE) VALUES ('${req.body.bookId}','${req.cookies.user_id}', '${getToday()}')`, function(err, result){
		if(err){
			console.log(err);
			return
		}
		res.send({
			err: 0
		})
	})
})

app.post('/login', (req,res)=>{
	console.log(req.body)
	console.log(req.cookies)
	connection.query(`SELECT USER_ID, USER_NAME, PASSWORD FROM USERS WHERE USER_NAME='${req.body.name}'`, function(err, result){
		if(err) throw err
		if(result == false){
			res.send({
				code: -1,
				message: 'account not found'
			})
			return
		}
		if(result[0].PASSWORD != req.body.password){
			res.send({
				code: -2,
				message: 'wrong password'
			})
			return
		}
		res.setHeader('Set-Cookie', `user_id=${result[0].USER_ID}; path=/; max-age=5000`)
		res.send({
			code: 0,
			message: 'login success'
		})
	})
})


app.get('/profile', (req, res)=>{
	connection.query(`SELECT USER_ID, USER_NAME, ISVIP, BALANCE FROM USERS WHERE USER_ID=${req.cookies.user_id}`, (err, result)=>{
		if(err){
			console.log(err);
			res.end('err')
		}else{
			console.log(result);
			res.json(result)
		}
	})
})

app.post('/signup', (req, res)=>{
	let today = new Date().toLocaleString('zh', {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'}).replaceAll('/', '-')
	console.log(req.body);
	if (req.body.name == null || req.body.password == null){
		res.send({
			code: -2
		})
		return
	}
	connection.query(`SELECT USER_NAME FROM USERS WHERE USER_NAME='${req.body.name}'`, function(err, results, fields){
		if (err) throw err
		if(results == false){
			connection.query(`INSERT INTO USERS(USER_NAME, PASSWORD, CREATED_DATE) VALUES ('${req.body.name}','${req.body.password}', '${today}')`, function(err, result){
				if(err){
					console.log(err);
					return
				}
				console.log('success');
			})
			res.send({
				code: 0
			})
		}else{
			res.send({
				code: -1
			})
		}
	})
})


/*Test*/


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
