package testing

import (
	"bufio"
	"database/sql"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"os/exec"
	"regexp"
	"testing"

	"github.com/cockroachdb/cockroach-go/testserver"

	// Import postgres driver.
	_ "github.com/lib/pq"
)

var rootat = regexp.MustCompile(`root@`)
var failed = regexp.MustCompile(`FAILED`)

// initTestDatabase launches a test database as a subprocess.
func initTestDatabase(t *testing.T) (string, func()) {
	ts, err := testserver.NewTestServer()
	if err != nil {
		t.Fatal(err)
	}

	if err := ts.Start(); err != nil {
		t.Fatal(err)
	}

	url := ts.PGURL()
	if url == nil {
		t.Fatalf("url not found")
	}
	url.Path = `hibernate_orm_test`

	// Hibernate's test suite doesn't seem to do so great connecting with the
	// root@.
	modifiedUrl := rootat.ReplaceAllString(url.String(), ``)

	db, err := sql.Open("postgres", url.String())
	if err != nil {
		t.Fatal(err)
	}

	ts.WaitForInit(db)

	// Create the database if it does not exist.
	if _, err := db.Exec("CREATE DATABASE IF NOT EXISTS hibernate_orm_test"); err != nil {
		t.Fatal(err)
	}

	if _, err := db.Exec("CREATE USER hibernate_orm_test WITH PASSWORD 'hibernate_orm_test'"); err != nil {
		t.Fatal(err)
	}

	if _, err := db.Exec("GRANT ALL ON DATABASE hibernate_orm_test TO hibernate_orm_test"); err != nil {
		t.Fatal(err)
	}

	return modifiedUrl, func() {
		_ = db.Close()
		ts.Stop()
	}
}

func createHibernateConfig(dbUrl string) string {
	return fmt.Sprintf(`#
# Hibernate, Relational Persistence for Idiomatic Java
#
# License: GNU Lesser General Public License (LGPL), version 2.1 or later.
# See the lgpl.txt file in the root directory or <http://www.gnu.org/licenses/lgpl-2.1.html>.
#

hibernate.dialect org.hibernate.dialect.CockroachDBDialect
hibernate.connection.driver_class org.postgresql.Driver
hibernate.connection.url jdbc:%s
hibernate.connection.username hibernate_orm_test
hibernate.connection.password hibernate_orm_test

hibernate.connection.pool_size 5

hibernate.show_sql true
hibernate.format_sql true

hibernate.max_fetch_depth 5

hibernate.cache.region_prefix hibernate.test
hibernate.cache.region.factory_class org.hibernate.testing.cache.CachingRegionFactory

hibernate.service.allow_crawling=false
hibernate.session.events.log=true`, dbUrl)
}

func writeHibernateConfig(connectionUrl, repoRoot string) {
	properties := []byte(createHibernateConfig(connectionUrl))
	ioutil.WriteFile(repoRoot+"/databases/crdb/resources/hibernate.properties", properties, 0644)
}

func TestHibernate(t *testing.T) {
	dbUrl, stopDB := initTestDatabase(t)
	defer stopDB()

	hibernateRepoRoot, err := os.Getwd()
	if err != nil {
		log.Fatal(err)
	}

	// We originally have the directory of the test files.
	hibernateRepoRoot = hibernateRepoRoot + "/.."

	// We need to write out a config file to tell the test suite what connection
	// URL to use. There doesn't seem to be a way to specify this on the command
	// line.
	writeHibernateConfig(dbUrl, hibernateRepoRoot)

	cmd := exec.Command("gradle", "hibernate-core:matrix_crdb", "--rerun-tasks")
	cmd.Dir = hibernateRepoRoot

	cmdReader, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}

	scanner := bufio.NewScanner(cmdReader)
	go func() {
		for scanner.Scan() {
			line := scanner.Text()
			if failed.MatchString(line) {
				t.Error(line)
			}
			if err := scanner.Err(); err != nil {
				t.Fatal(err)
			}
			fmt.Println(scanner.Text())
		}
	}()

	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}

	if err := cmd.Wait(); err != nil {
		t.Fatal(err)
	}
}
