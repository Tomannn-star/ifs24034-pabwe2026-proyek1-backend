pipeline {
    agent any

    environment {
        // Path environment untuk runtime Bun pada Linux / Windows agent
        PATH = "${env.HOME ? env.HOME + '/.bun/bin:' : ''}${env.PATH}"
    }

    options {
        timeout(time: 15, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
        ansiColor('xterm')
    }

    stages {
        stage('Verifikasi Environment') {
            steps {
                script {
                    echo "============================================="
                    echo "🚀 Pipeline CI/CD Backend KasPintar"
                    echo "============================================="
                    if (isUnix()) {
                        sh 'bun --version'
                        sh 'git log -1 --oneline'
                    } else {
                        bat 'bun --version'
                        bat 'git log -1 --oneline'
                    }
                }
            }
        }

        stage('Install Dependencies') {
            steps {
                script {
                    echo "📦 Menginstal dependensi Backend..."
                    if (isUnix()) {
                        sh 'bun install --frozen-lockfile || bun install'
                    } else {
                        bat 'bun install'
                    }
                }
            }
        }

        stage('Test Backend API') {
            steps {
                script {
                    echo "🧪 Menjalankan 33 unit test otomatis backend..."
                    if (isUnix()) {
                        sh 'bun test'
                    } else {
                        bat 'bun test'
                    }
                }
            }
        }
    }

    post {
        always {
            echo "🏁 Pipeline Backend KasPintar selesai dijalankan."
        }
        success {
            echo "🎉 SUKSES: Seluruh 33 pengujian backend API KasPintar lolos tanpa error!"
        }
        failure {
            echo "❌ GAGAL: Terjadi kegagalan pada pengujian backend. Periksa log di atas."
        }
    }
}
